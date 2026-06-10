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
} from "@/lib/youtube";
import {
  markJobCompleted,
  markJobFailed,
  queueEpisodeProcessing,
  updateJobProgress,
} from "@/lib/queue";

export async function runSourceSyncJob(jobId: string, sourceId: string) {
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
    const detected = detectYouTubeSourceType(source.sourceUrl);
    let videos = [] as Awaited<ReturnType<typeof syncYouTubeSource>>["videos"];

    if (detected === "youtube_video") {
      const v = await extractYouTubeMetadata(source.sourceUrl);
      videos = [v];
    } else {
      const ch = await syncYouTubeSource(source.sourceUrl);
      videos = ch.videos;
    }

    let added = 0;
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const meta = buildEpisodeMetadata(v);

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

      // Enqueue the pipeline for newly-created episodes only.
      if (ep.processingStatus === "queued" && !ep.audioFilePath) {
        await queueEpisodeProcessing(ep.id);
        added++;
      }

      await updateJobProgress(
        jobId,
        Math.round(((i + 1) / videos.length) * 100),
      );
    }

    await db.source.update({
      where: { id: sourceId },
      data: {
        syncStatus: "completed",
        lastSyncedAt: new Date(),
      },
    });

    await markJobCompleted(jobId);
    return { episodesFound: videos.length, episodesAdded: added };
  } catch (err: any) {
    await db.source.update({
      where: { id: sourceId },
      data: { syncStatus: "error" },
    });
    await markJobFailed(jobId, err?.message ?? "Unknown error");
    throw err;
  }
}
