/**
 * Routes `source_sync` jobs to the correct ingestion worker by source type.
 */
import { isRssFeedUrl } from "@/lib/sourceTypes";
import { runRssSourceSyncJob } from "./rssIngestWorker";
import { runYouTubeSourceSyncJob } from "./youtubeIngestWorker";

export async function runSourceSyncJob(jobId: string, sourceId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    const { markJobFailed } = await import("@/lib/queue");
    await markJobFailed(jobId, `Source ${sourceId} not found`);
    return;
  }

  const isRss =
    source.sourceType === "rss" ||
    source.sourceType === "rss_future" ||
    isRssFeedUrl(source.sourceUrl);

  if (isRss) {
    return runRssSourceSyncJob(jobId, sourceId);
  }
  return runYouTubeSourceSyncJob(jobId, sourceId);
}
