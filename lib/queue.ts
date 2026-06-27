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
import type { JobStatus, JobType } from "./constants";
import { PROCESSING_ORDER } from "./constants";

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
  const jobs = [];
  for (const jobType of PROCESSING_ORDER) {
    jobs.push(await createProcessingJob({ episodeId, jobType }));
  }
  return jobs;
}

/** The pipeline minus thumbnail caching — used when re-queuing a backlog
 * episode that already has its thumbnail. */
const DOWNLOAD_PIPELINE = PROCESSING_ORDER.filter(
  (t) => t !== "thumbnail_cache",
);

const ACTIVE_STATUSES = [
  "queued",
  "running",
  "downloading",
  "transcribing",
  "segmenting",
  "embedding",
  "indexing",
];

/**
 * Idempotently enqueue the download→index pipeline for an episode.
 * Skips episodes that already have audio, are searchable, or already have an
 * in-flight pipeline job. Safe to call repeatedly (e.g. from a re-sync).
 * Returns true if jobs were created.
 */
export async function queueEpisodeProcessingIfNeeded(
  episodeId: string,
): Promise<boolean> {
  const { getDb } = await import("./db");
  const db = getDb();

  const ep = await db.episode.findUnique({
    where: { id: episodeId },
    select: { id: true, audioFilePath: true, isSearchable: true },
  });
  if (!ep) return false;
  if (ep.audioFilePath || ep.isSearchable) return false;

  const active = await db.processingJob.findFirst({
    where: {
      episodeId,
      jobType: { in: DOWNLOAD_PIPELINE as string[] },
      status: { in: ACTIVE_STATUSES },
    },
    select: { id: true },
  });
  if (active) return false;

  for (const jobType of DOWNLOAD_PIPELINE) {
    await createProcessingJob({ episodeId, jobType });
  }
  return true;
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
    const active = await db.processingJob.findFirst({
      where: {
        sourceId: s.id,
        jobType: "source_sync",
        status: { in: ["queued", "running"] },
      },
      select: { id: true },
    });
    if (active) continue;
    await createProcessingJob({ sourceId: s.id, jobType: "source_sync" });
    enqueued++;
  }
  return enqueued;
}

const CANCELLED_BY_USER = "Stopped by user";

/**
 * Halt ingestion for a source: disable auto-sync, clear queued work, reset status.
 * In-flight worker jobs may still finish the current step; nothing new will queue.
 */
export async function stopSourceSync(sourceId: string): Promise<{
  cancelledJobs: number;
  cancelledDownloads: number;
}> {
  const { getDb } = await import("./db");
  const db = getDb();

  const episodeIds = (
    await db.episode.findMany({
      where: { sourceId },
      select: { id: true },
    })
  ).map((e) => e.id);

  const [sourceJobs, episodeJobs, downloads] = await Promise.all([
    db.processingJob.updateMany({
      where: { sourceId, status: "queued" },
      data: {
        status: "failed",
        errorMessage: CANCELLED_BY_USER,
        completedAt: new Date(),
      },
    }),
    episodeIds.length > 0
      ? db.processingJob.updateMany({
          where: { episodeId: { in: episodeIds }, status: "queued" },
          data: {
            status: "failed",
            errorMessage: CANCELLED_BY_USER,
            completedAt: new Date(),
          },
        })
      : Promise.resolve({ count: 0 }),
    db.download.updateMany({
      where: { sourceId, status: "queued" },
      data: {
        status: "failed",
        errorMessage: CANCELLED_BY_USER,
        completedAt: new Date(),
      },
    }),
  ]);

  await db.source.update({
    where: { id: sourceId },
    data: { autoSync: false, syncStatus: "idle" },
  });

  return {
    cancelledJobs: sourceJobs.count + episodeJobs.count,
    cancelledDownloads: downloads.count,
  };
}

/** Pick the next queued job (pipeline-first), marked as running atomically. */
export async function getNextQueuedJob(workerId: string) {
  const { getDb } = await import("./db");
  const db = getDb();
  const [row] = await db.$queryRawUnsafe<any[]>(
    `
    UPDATE processing_jobs
    SET status = 'running', started_at = NOW(), worker_id = $1
    WHERE id = (
      SELECT pj.id FROM processing_jobs pj
      WHERE pj.status = 'queued'
        AND (
          pj.episode_id IS NULL
          OR pj.job_type IN ('download', 'thumbnail_cache', 'source_sync')
          OR EXISTS (
            SELECT 1 FROM episodes e
            WHERE e.id = pj.episode_id
              AND (
                (pj.job_type = 'audio_extract' AND e.audio_file_path IS NOT NULL)
                OR (pj.job_type = 'transcription' AND e.audio_file_path IS NOT NULL)
                OR (pj.job_type = 'transcript_segmentation' AND e.is_transcribed = true)
                OR (pj.job_type = 'embedding' AND e.is_transcribed = true)
                OR (pj.job_type = 'indexing' AND e.is_embedded = true)
              )
          )
        )
      ORDER BY
        CASE job_type
          WHEN 'source_sync' THEN 0
          WHEN 'download' THEN 1
          WHEN 'audio_extract' THEN 2
          WHEN 'transcription' THEN 3
          WHEN 'transcript_segmentation' THEN 4
          WHEN 'embedding' THEN 5
          WHEN 'indexing' THEN 6
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
  return db.processingJob.update({
    where: { id: jobId },
    data: {
      status,
      ...extra,
    },
  });
}

export async function updateJobProgress(
  jobId: string,
  progressPercent: number,
) {
  const { getDb } = await import("./db");
  const db = getDb();
  return db.processingJob.update({
    where: { id: jobId },
    data: { progressPercent },
  });
}

export async function markJobCompleted(jobId: string) {
  const { getDb } = await import("./db");
  const db = getDb();
  return db.processingJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progressPercent: 100,
      completedAt: new Date(),
    },
  });
}

export async function markJobFailed(jobId: string, errorMessage: string) {
  const { getDb } = await import("./db");
  const db = getDb();
  return db.processingJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    },
  });
}

export async function retryFailedJob(jobId: string) {
  const { getDb } = await import("./db");
  const db = getDb();
  return db.processingJob.update({
    where: { id: jobId },
    data: {
      status: "queued",
      progressPercent: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      retryCount: { increment: 1 },
    },
  });
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
