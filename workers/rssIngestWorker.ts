/**
 * RSS ingestion worker — handles `source_sync` for podcast RSS feeds.
 */
import {
  buildRssEpisodeMetadata,
  fetchRssFeed,
} from "@/lib/rss";
import {
  markJobCompleted,
  markJobFailed,
  getQueueLimits,
  queueEpisodeProcessingIfNeeded,
  updateJobProgress,
} from "@/lib/queue";

async function updatePodcastBranding(
  podcastId: string,
  feed: {
    title: string;
    description: string | null;
    imageUrl: string | null;
    link: string | null;
  },
) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();
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

  await db.source.update({
    where: { id: sourceId },
    data: { syncStatus: "syncing" },
  });
  await db.sourceSyncJob.create({
    data: {
      sourceId,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    const feed = await fetchRssFeed(source.sourceUrl);
    await updatePodcastBranding(source.podcastId, feed);

    let added = 0;
    let deferred = 0;
    const { maxEpisodesQueuedPerSync } = getQueueLimits(source.sourceType);
    const items = feed.items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const meta = buildRssEpisodeMetadata(item);

      const ep = await db.episode.upsert({
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
      });

      if (added >= maxEpisodesQueuedPerSync) {
        deferred++;
      } else {
        const queued = await queueEpisodeProcessingIfNeeded(ep.id);
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

    await db.source.update({
      where: { id: sourceId },
      data: {
        syncStatus: "completed",
        lastSyncedAt: new Date(),
      },
    });

    await db.sourceSyncJob.updateMany({
      where: { sourceId, status: "running" },
      data: { status: "completed", completedAt: new Date() },
    });

    await markJobCompleted(jobId);
    return { episodesFound: items.length, episodesQueued: added, deferred };
  } catch (err: any) {
    await db.sourceSyncJob.updateMany({
      where: { sourceId, status: "running" },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err?.message ?? "Unknown error",
      },
    });
    await db.source.update({
      where: { id: sourceId },
      data: { syncStatus: "error" },
    });
    await markJobFailed(jobId, err?.message ?? "Unknown error");
    throw err;
  }
}
