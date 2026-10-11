import type { Prisma } from "@prisma/client";
import { withActiveJob } from "@/lib/jobControl";
/**
 * YouTube ingestion worker.
 *
 * Handles `source_sync` jobs:
 *   1. Read source row.
 *   2. Run `syncYouTubeSource(url)` to discover videos.
 *   3. Upsert episodes into the DB.
 *   4. Enqueue the per-episode pipeline (thumbnail → download → transcribe → ...).
 */
import {
  buildEpisodeMetadata,
  syncYouTubeSource,
  extractYouTubeMetadata,
  detectYouTubeSourceType,
  fetchYouTubeChannelProfile,
  type YouTubeChannel,
} from "@/lib/youtube";
import {
  markJobFailed,
  getQueueLimits,
  queueEpisodeProcessingIfNeeded,
  updateJobProgress,
} from "@/lib/queue";

async function updatePodcastBranding(
  db: Prisma.TransactionClient,
  podcastId: string,
  channel: Pick<
    YouTubeChannel,
    "channelName" | "thumbnailUrl" | "description" | "channelUrl"
  >,
) {
  const data: {
    name?: string;
    coverImageUrl?: string;
    description?: string;
    officialUrl?: string;
  } = {};
  if (channel.thumbnailUrl) data.coverImageUrl = channel.thumbnailUrl;
  if (channel.channelName) data.name = channel.channelName;
  if (channel.description) data.description = channel.description;
  if (channel.channelUrl) data.officialUrl = channel.channelUrl;
  if (Object.keys(data).length === 0) return;
  await db.podcast.update({ where: { id: podcastId }, data });
}

export async function runYouTubeSourceSyncJob(jobId: string, sourceId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    await markJobFailed(jobId, `Source ${sourceId} not found`);
    return;
  }

  const syncRun = await withActiveJob(db, jobId, { sourceId }, async (tx) => {
    await tx.source.update({
      where: { id: sourceId },
      data: { syncStatus: "syncing" },
    });
    return tx.sourceSyncJob.create({
      data: {
        sourceId,
        status: "running",
        startedAt: new Date(),
      },
    });
  });

  try {
    const detected = detectYouTubeSourceType(source.sourceUrl);
    let videos = [] as Awaited<ReturnType<typeof syncYouTubeSource>>["videos"];
    let channelMeta: Pick<
      YouTubeChannel,
      "channelName" | "thumbnailUrl" | "description" | "channelUrl"
    > | null = null;

    if (detected === "youtube_video") {
      const v = await extractYouTubeMetadata(source.sourceUrl);
      videos = [v];
      const channelUrl = v.channelId
        ? `https://www.youtube.com/channel/${v.channelId}`
        : source.sourceUrl;
      try {
        channelMeta = await fetchYouTubeChannelProfile(channelUrl);
      } catch (err: any) {
        console.warn(
          `[source_sync] channel profile fetch failed for ${channelUrl}: ${err?.message ?? err}`,
        );
      }
    } else {
      const ch = await syncYouTubeSource(source.sourceUrl);
      videos = ch.videos;
      channelMeta = ch;
    }

    if (channelMeta) {
      await withActiveJob(db, jobId, { sourceId }, (tx) => updatePodcastBranding(tx, source.podcastId, channelMeta!));
    }

    let added = 0;
    let deferred = 0;
    const { maxEpisodesQueuedPerSync } = getQueueLimits();

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const meta = buildEpisodeMetadata(v);

      const ep = await withActiveJob(db, jobId, { sourceId }, (tx) => tx.episode.upsert({
        where: {
          sourceId_externalId: {
            sourceId,
            externalId: meta.externalId,
          },
        },
        update: meta,
        create: {
          ...meta,
          podcastId: source.podcastId,
          sourceId,
        },
      }));

      if (added >= maxEpisodesQueuedPerSync) {
        deferred++;
      } else {
        const queued = await queueEpisodeProcessingIfNeeded(ep.id, jobId);
        if (queued) added++;
        else if (!ep.audioFilePath && !ep.isSearchable) deferred++;
      }

      await updateJobProgress(
        jobId,
        Math.round(((i + 1) / videos.length) * 100),
      );
    }

    if (deferred > 0) {
      console.log(
        `[source_sync] ${source.sourceName}: queued ${added} episode pipeline(s), deferred ${deferred} (backpressure — will drain on next sync)`,
      );
    }

    await withActiveJob(db, jobId, { sourceId }, async (tx) => {
      await tx.source.update({ where: { id: sourceId }, data: { syncStatus: "completed", lastSyncedAt: new Date() } });
      await tx.sourceSyncJob.update({ where: { id: syncRun.id }, data: { status: "completed", completedAt: new Date() } });
      await tx.processingJob.update({ where: { id: jobId }, data: { status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date() } });
    });
    return { episodesFound: videos.length, episodesQueued: added, deferred };
  } catch (err: any) {
    await withActiveJob(db, jobId, { sourceId }, async (tx) => {
      await tx.sourceSyncJob.update({ where: { id: syncRun.id }, data: { status: "failed", completedAt: new Date(), errorMessage: err?.message ?? "Unknown error" } });
      await tx.source.update({ where: { id: sourceId }, data: { syncStatus: "error" } });
      await tx.processingJob.update({ where: { id: jobId }, data: { status: "failed", completedAt: new Date(), errorMessage: err?.message ?? "Unknown error" } });
    });
    throw err;
  }
}
