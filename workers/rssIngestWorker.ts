import type { Prisma } from "@prisma/client";
import { withActiveJob } from "@/lib/jobControl";
/**
 * RSS ingestion worker — handles `source_sync` for podcast RSS feeds.
 */
import {
  buildRssEpisodeMetadata,
  fetchRssFeed,
} from "@/lib/rss";
import {
  markJobFailed,
  getQueueLimits,
  queueEpisodeProcessingIfNeeded,
  updateJobProgress,
} from "@/lib/queue";

async function updatePodcastBranding(
  db: Prisma.TransactionClient,
  podcastId: string,
  feed: {
    title: string;
    description: string | null;
    imageUrl: string | null;
    link: string | null;
  },
) {
  const data: {
    name?: string;
    coverImageUrl?: string;
    description?: string;
    officialUrl?: string;
  } = {};
  if (feed.imageUrl) data.coverImageUrl = feed.imageUrl;
  if (feed.title) data.name = feed.title;
  if (feed.description) data.description = feed.description;
  if (feed.link) data.officialUrl = feed.link;
  if (Object.keys(data).length === 0) return;
  await db.podcast.update({ where: { id: podcastId }, data });
}

export async function runRssSourceSyncJob(jobId: string, sourceId: string) {
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
    const feed = await fetchRssFeed(source.sourceUrl);
    await withActiveJob(db, jobId, { sourceId }, (tx) => updatePodcastBranding(tx, source.podcastId, feed));

    let added = 0;
    let deferred = 0;
    const { maxEpisodesQueuedPerSync } = getQueueLimits(source.sourceType);
    const items = feed.items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const meta = buildRssEpisodeMetadata(item);

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
        Math.round(((i + 1) / items.length) * 100),
      );
    }

    if (deferred > 0) {
      console.log(
        `[source_sync:rss] ${source.sourceName}: queued ${added} episode pipeline(s), deferred ${deferred} (backpressure — will drain on next sync)`,
      );
    }

    await withActiveJob(db, jobId, { sourceId }, async (tx) => {
      await tx.source.update({ where: { id: sourceId }, data: { syncStatus: "completed", lastSyncedAt: new Date() } });
      await tx.sourceSyncJob.update({ where: { id: syncRun.id }, data: { status: "completed", completedAt: new Date() } });
      await tx.processingJob.update({ where: { id: jobId }, data: { status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date() } });
    });
    return { episodesFound: items.length, episodesQueued: added, deferred };
  } catch (err: any) {
    await withActiveJob(db, jobId, { sourceId }, async (tx) => {
      await tx.sourceSyncJob.update({ where: { id: syncRun.id }, data: { status: "failed", completedAt: new Date(), errorMessage: err?.message ?? "Unknown error" } });
      await tx.source.update({ where: { id: sourceId }, data: { syncStatus: "error" } });
      await tx.processingJob.update({ where: { id: jobId }, data: { status: "failed", completedAt: new Date(), errorMessage: err?.message ?? "Unknown error" } });
    });
    throw err;
  }
}
