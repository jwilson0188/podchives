import { writeJobProgress, retryJob } from "./jobControl";
/**
 * Processing queue.
 *
 * Backed by the `processing_jobs` table. The web app should never call the
 * heavy work directly — it just enqueues jobs and lets a worker pick them up.
 *
 * Job lifecycle:
 *   queued → running → (downloading | transcribing | embedding | indexing) → completed
 *                  ↘ failed
 */
import { admitSourceSync, admitAudioFallback } from "./queueControl";
import type { PrismaClient } from "@prisma/client";
import type { JobStatus, JobType } from "./constants";
import { admitEpisodeProcessing, getQueueLimits } from "./queueAdmission";
export { getQueueLimits } from "./queueAdmission";
import { completeMediaPipelineJob, enqueuePipelineSuccessor, failMediaPipelineJob, MEDIA_JOB_TYPES } from "./queueTransitions";
import { failTranscriptJob, TRANSCRIPT_JOB_TYPES } from "./transcriptIntegrity";
import {
  EPISODE_PIPELINE,
  isPipelineJobType,
} from "./pipeline";
import {
  shouldTryYouTubeCaptions,
} from "./transcriptionConfig";

export type ProcessingJob = {
  id: string;
  episodeId: string | null;
  sourceId: string | null;
  jobType: JobType;
  status: JobStatus;
  progressPercent: number;
  workerId: string | null;
  retryCount: number;
  errorMessage: string | null;
};

export async function createProcessingJob(args: {
  episodeId?: string;
  sourceId?: string;
  jobType: JobType;
}) {
  const { getDb } = await import("./db");
  const db = getDb();
  if (args.jobType === "source_sync") {
    if (!args.sourceId) throw new Error("Source sync requires a source ID");
    const result = await admitSourceSync(db, args.sourceId);
    if (!result) throw new Error("Source not found");
    return result.job;
  }
  return db.processingJob.create({
    data: {
      episodeId: args.episodeId,
      sourceId: args.sourceId,
      jobType: args.jobType,
      status: "queued",
      progressPercent: 0,
    },
  });
}

/**
 * Enqueue the full pipeline for a freshly-ingested episode.
 *
 * Worker order:
 *   thumbnail_cache → download → audio_extract → transcription
 *   → transcript_segmentation → embedding → indexing
 */
export async function queueEpisodeProcessing(episodeId: string) {
  const { getDb } = await import("./db");
  const job = await admitEpisodeProcessing(getDb(), episodeId);
  return job ? [job] : [];
}

/**
 * Enqueue the next pipeline step after `completedJobType` succeeds.
 * Skips no-op steps (cached thumbnail, YouTube mp3 extract).
 */
export async function enqueueNextPipelineJob(
  episodeId: string,
  completedJobType: JobType,
): Promise<boolean> {
  const { getDb } = await import("./db");
  return enqueuePipelineSuccessor(getDb(), episodeId, completedJobType);
}

/** Media job completion + successor admission; transcript stages use their own guards. */
export async function completePipelineJob(
  jobId: string,
  episodeId: string | null | undefined,
  jobType: string,
): Promise<void> {
  if (!episodeId) throw new Error("Pipeline job missing episode ID");
  const { getDb } = await import("./db");
  await completeMediaPipelineJob(getDb(), jobId, episodeId, jobType);
}

/** In-flight worker states (not queued / terminal). */
export const INFLIGHT_STATUSES = [
  "running",
  "downloading",
  "transcribing",
  "segmenting",
  "embedding",
  "indexing",
  "extracting_audio",
] as const;


async function countSourcePipelinePressure(sourceId: string): Promise<{
  queuedPipelines: number;
  inflight: number;
  sourceType: string;
}> {
  const { getDb } = await import("./db");
  const db = getDb();

  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: { sourceType: true },
  });

  const base = {
    episode: { sourceId },
    jobType: { in: EPISODE_PIPELINE as string[] },
    episodeId: { not: null },
  };

  const [queuedRows, inflightRows] = await Promise.all([
    db.processingJob.findMany({
      where: { ...base, status: "queued" },
      select: { episodeId: true },
      distinct: ["episodeId"],
    }),
    db.processingJob.findMany({
      where: { ...base, status: { in: [...INFLIGHT_STATUSES] } },
      select: { episodeId: true },
      distinct: ["episodeId"],
    }),
  ]);

  return {
    queuedPipelines: queuedRows.length,
    inflight: inflightRows.length,
    sourceType: source?.sourceType ?? "",
  };
}

export async function canQueueEpisodeForSource(
  sourceId: string,
): Promise<boolean> {
  const { queuedPipelines, inflight, sourceType } =
    await countSourcePipelinePressure(sourceId);
  const limits = getQueueLimits(sourceType);
  return (
    queuedPipelines < limits.maxQueuedEpisodesPerSource &&
    inflight < limits.maxInflightEpisodesPerSource
  );
}

/**
 * Re-queue jobs stuck in a processing state (worker crash / deploy mid-job).
 */
export async function reclaimStaleJobs(
  staleMinutes = 45,
): Promise<number> {
  const { getDb } = await import("./db");
  const db = getDb();
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const result = await db.processingJob.updateMany({
    where: {
      status: { in: [...INFLIGHT_STATUSES] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "queued",
      workerId: null,
      errorMessage: "Requeued after stale timeout",
    },
  });
  return result.count;
}

/**
 * Idempotently enqueue the download→index pipeline for an episode.
 * Resumes from persisted transcript/readiness and usable local media.
 * Admission and source-pressure checks serialize across concurrent syncs.
 * Returns true if jobs were created.
 */
export async function queueEpisodeProcessingIfNeeded(
  episodeId: string, sourceJobId?: string,
): Promise<boolean> {
  const { getDb } = await import("./db");
  return Boolean(await admitEpisodeProcessing(getDb(), episodeId, { sourceJobId }));
}

/**
 * Last-resort recovery for an episode whose transcript sources all failed.
 *
 * Caption-backed and feed-transcript episodes deliberately skip the audio
 * download, so when those sources turn out to be unavailable there is nothing
 * for Whisper to work with and the episode would otherwise be dead. Queue a
 * real download so the paid path can take over.
 *
 * Rejects stale workers, preserves existing text, and serializes download
 * admission with transcription failure. Returns true if a job was created.
 */
export async function queueAudioFallbackDownload(
  episodeId: string, jobId: string, expectedSegmentIds: readonly string[], message: string,
): Promise<boolean> {
  const { getDb } = await import("./db");
  return admitAudioFallback(getDb(), episodeId, jobId, expectedSegmentIds, message);
}

/**
 * Has transcription already failed for this episode? The download fast-path
 * consults this: skipping the fetch is only safe while a transcript source
 * still looks viable. Without it, the fallback download would no-op and the
 * episode would ping-pong between `download` and `transcription` forever.
 */
export async function hasFailedTranscription(
  episodeId: string,
): Promise<boolean> {
  const { getDb } = await import("./db");
  const db = getDb();
  const failed = await db.processingJob.findFirst({
    where: { episodeId, jobType: "transcription", status: "failed" },
    select: { id: true },
  });
  return failed !== null;
}

/**
 * Enqueue a `source_sync` job for every source whose last sync is older than
 * `intervalMinutes` (or never synced) and has no in-flight sync. Drives both
 * backlog draining and automatic discovery of newly-published videos.
 * Returns the number of sources queued for sync.
 */
export async function enqueueDueSourceSyncs(
  intervalMinutes: number,
): Promise<number> {
  const { getDb } = await import("./db");
  const db = getDb();

  const cutoff = new Date(Date.now() - intervalMinutes * 60_000);
  const sources = await db.source.findMany({
    where: {
      autoSync: true,
      syncStatus: { not: "syncing" },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
    },
    select: { id: true },
  });

  let enqueued = 0;
  for (const s of sources) {
    const result = await admitSourceSync(db, s.id, cutoff);
    if (result?.created) enqueued++;
  }
  return enqueued;
}

const CANCELLED_BY_USER = "Stopped by user";

/**
 * Halt ingestion for a source: disable auto-sync, clear queued work, reset status.
 * Running external calls can finish, but their cancelled jobs cannot publish or enqueue successors.
 */
export async function stopSourceSync(sourceId: string, database?: PrismaClient): Promise<{
  cancelledJobs: number;
  cancelledDownloads: number;
}> {
  const db = database ?? (await import("./db")).getDb();

  return db.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM sources WHERE id=${sourceId} FOR UPDATE`;
    await db.$queryRaw`SELECT id FROM episodes WHERE source_id=${sourceId} ORDER BY id FOR UPDATE`;
    const episodeIds = (
      await db.episode.findMany({
        where: { sourceId },
        select: { id: true },
      })
    ).map((e) => e.id);

    const [sourceJobs, episodeJobs, downloads] = await Promise.all([
      db.processingJob.updateMany({
        where: { sourceId, status: { in: ["queued", ...INFLIGHT_STATUSES] } },
        data: {
          status: "failed",
          errorMessage: CANCELLED_BY_USER,
          completedAt: new Date(),
        },
      }),
      episodeIds.length > 0
        ? db.processingJob.updateMany({
            where: { episodeId: { in: episodeIds }, status: { in: ["queued", ...INFLIGHT_STATUSES] } },
            data: {
              status: "failed",
              errorMessage: CANCELLED_BY_USER,
              completedAt: new Date(),
            },
          })
        : Promise.resolve({ count: 0 }),
      db.download.updateMany({
        where: { sourceId, status: { in: ["queued", ...INFLIGHT_STATUSES] } },
        data: {
          status: "failed",
          errorMessage: CANCELLED_BY_USER,
          completedAt: new Date(),
        },
      }),
    ]);

    await db.sourceSyncJob.updateMany({ where: { sourceId, status: { in: ["queued", "running"] } }, data: { status: "failed", errorMessage: CANCELLED_BY_USER, completedAt: new Date() } });
    await db.source.update({
      where: { id: sourceId },
      data: { autoSync: false, syncStatus: "idle" },
    });

    return {
      cancelledJobs: sourceJobs.count + episodeJobs.count,
      cancelledDownloads: downloads.count,
    };
  });
}

/** Pick the next queued job (pipeline-first), marked as running atomically. */
export async function getNextQueuedJob(workerId: string, database?: PrismaClient) {
  const db = database ?? (await import("./db")).getDb();

  // Transcription doesn't always need audio: YouTube captions and RSS feed
  // transcripts are fetched from the network, and the pipeline deliberately
  // skips the download for those. This predicate must mirror what
  // runTranscriptionJob actually accepts (see workers/transcriptionWorker.ts) —
  // if it's stricter, those jobs sit in `queued` forever and the per-source
  // backpressure counter wedges the whole source.
  const captionsBackend = shouldTryYouTubeCaptions("youtube");

  const [row] = await db.$queryRawUnsafe<any[]>(
    `
    UPDATE processing_jobs
    SET status = 'running', started_at = NOW(), updated_at = NOW(), worker_id = $1
    WHERE id = (
      SELECT pj.id FROM processing_jobs pj
      WHERE pj.status = 'queued'
        AND NOT EXISTS (SELECT 1 FROM scheduler_settings WHERE worker_enabled = false)
        AND (pj.error_message IS NULL OR (pj.error_message <> 'Stopped by user'
          AND pj.error_message NOT LIKE 'cancelled:%' AND pj.error_message NOT LIKE 'superseded:%'))
        AND (
          pj.episode_id IS NULL
          OR pj.job_type IN ('download', 'thumbnail_cache', 'source_sync')
          OR EXISTS (
            SELECT 1 FROM episodes e
            WHERE e.id = pj.episode_id
              AND (
                (pj.job_type = 'audio_extract' AND e.audio_file_path IS NOT NULL)
                OR (
                  pj.job_type = 'transcription'
                  AND (
                    e.audio_file_path IS NOT NULL
                    OR ($2::boolean AND lower(e.source_platform) = 'youtube')
                    OR (
                      lower(e.source_platform) = 'rss'
                      AND btrim(coalesce(e.transcript_original_url, '')) <> ''
                    )
                  )
                )
                OR (pj.job_type = 'transcript_segmentation' AND EXISTS (SELECT 1 FROM transcript_segments ts WHERE ts.episode_id=e.id))
                OR (pj.job_type = 'embedding' AND e.is_transcribed = true)
                OR (pj.job_type = 'indexing' AND e.is_embedded = true)
              )
          )
        )
      ORDER BY
        CASE job_type
          WHEN 'source_sync' THEN 0
          WHEN 'indexing' THEN 1
          WHEN 'embedding' THEN 2
          WHEN 'transcript_segmentation' THEN 3
          WHEN 'transcription' THEN 4
          WHEN 'audio_extract' THEN 5
          WHEN 'download' THEN 6
          WHEN 'thumbnail_cache' THEN 99
          ELSE 50
        END,
        created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
    `,
    workerId,
    captionsBackend,
  );
  return row ?? null;
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra: Partial<{
    progressPercent: number;
    errorMessage: string | null;
    workerId: string | null;
  }> = {},
) {
  const { getDb } = await import("./db");
  const db = getDb();
  return writeJobProgress(db, jobId, { status, ...extra });
}

export async function updateJobProgress(
  jobId: string,
  progressPercent: number,
) {
  const { getDb } = await import("./db");
  const db = getDb();
  return writeJobProgress(db, jobId, { progressPercent });
}

export async function markJobCompleted(jobId: string) {
  const { getDb } = await import("./db");
  const db = getDb();
  return writeJobProgress(db, jobId, { status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date() });
}

/** Cancel queued downstream pipeline jobs when an earlier step fails or stalls. */
export async function cancelOrphanedDownstreamJobs(
  episodeId: string,
  reason: string,
) {
  const { getDb } = await import("./db");
  const db = getDb();
  return db.processingJob.updateMany({
    where: {
      episodeId,
      status: "queued",
      jobType: {
        in: [
          "audio_extract",
          "transcription",
          "transcript_segmentation",
          "embedding",
          "indexing",
        ],
      },
    },
    data: {
      status: "completed",
      progressPercent: 0,
      errorMessage: reason,
      completedAt: new Date(),
    },
  });
}

export async function markJobFailed(jobId: string, errorMessage: string) {
  const { getDb } = await import("./db");
  const db = getDb();

  const job = await db.processingJob.findUnique({
    where: { id: jobId },
    select: { episodeId: true, jobType: true },
  });

  if (job?.episodeId && TRANSCRIPT_JOB_TYPES.includes(job.jobType as typeof TRANSCRIPT_JOB_TYPES[number])) {
    return failTranscriptJob(db, job.episodeId, jobId, errorMessage);
  }

  if (job?.episodeId && MEDIA_JOB_TYPES.includes(job.jobType as typeof MEDIA_JOB_TYPES[number])) {
    return failMediaPipelineJob(db, job.episodeId, jobId, errorMessage);
  }

  await writeJobProgress(db, jobId, { status: "failed", errorMessage, completedAt: new Date() });

  if (job?.episodeId && isPipelineJobType(job.jobType)) {
    await cancelOrphanedDownstreamJobs(
      job.episodeId,
      `cancelled: ${job.jobType} failed`,
    );
  }
}

export async function retryFailedJob(jobId: string) {
  const { getDb } = await import("./db");
  const db = getDb();
  return retryJob(db, jobId);
}

/**
 * Re-export the dispatcher under the spec's name. The real implementation
 * lives in `workers/processingWorker.ts` so this is a thin re-export to keep
 * `queue.ts` a single import surface for callers.
 */
export async function processJob(workerId?: string) {
  const { processOnce } = await import("../workers/processingWorker");
  return processOnce(workerId);
}
