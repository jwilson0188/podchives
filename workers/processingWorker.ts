/**
 * Main processing worker — the dispatcher.
 *
 * Pulls the next queued job and routes it to the right worker by jobType.
 * One concurrent job per worker process; run multiple processes for
 * parallelism (each gets a unique workerId).
 *
 * Lifecycle is logged into worker_runs so the UI can show worker history.
 */
import os from "node:os";
import fs from "node:fs";
import {
  completePipelineJob,
  getNextQueuedJob,
  hasFailedTranscription,
  markJobFailed,
  updateJobProgress,
  updateJobStatus,
} from "@/lib/queue";
import { runSourceSyncJob } from "./sourceSyncWorker";
import { downloadRssAudio } from "@/lib/rss";
import {
  runSegmentationJob,
  runTranscriptionJob,
} from "./transcriptionWorker";
import { runEmbeddingJob, runIndexingJob } from "./embeddingWorker";
import {
  cacheThumbnail,
  downloadAudio,
  extractAudioIfNeeded,
} from "@/lib/youtube";

export const DEFAULT_WORKER_ID = `worker-${os.hostname()}-${process.pid}`;

export type ProcessOnceResult = {
  jobId: string;
  jobType: string;
  status: "completed" | "failed" | "skipped";
  error?: string;
};

export async function processOnce(
  workerId = DEFAULT_WORKER_ID,
): Promise<ProcessOnceResult | null> {
  const job = await getNextQueuedJob(workerId);
  if (!job) return null;

  try {
    switch (job.job_type as string) {
      case "source_sync":
        if (!job.source_id) throw new Error("source_sync job missing source_id");
        await runSourceSyncJob(job.id, job.source_id);
        break;

      case "thumbnail_cache":
        await runThumbnailCacheJob(job.id, job.episode_id);
        await completePipelineJob(job.id, job.episode_id, "thumbnail_cache");
        break;

      case "download":
        await runDownloadJob(job.id, job.episode_id);
        await completePipelineJob(job.id, job.episode_id, "download");
        break;

      case "audio_extract":
        if (!job.episode_id)
          throw new Error("audio_extract job missing episode_id");
        await runAudioExtractJob(job.id, job.episode_id);
        await completePipelineJob(job.id, job.episode_id, "audio_extract");
        break;

      case "transcription":
        if (!job.episode_id)
          throw new Error("transcription job missing episode_id");
        await runTranscriptionJob(job.id, job.episode_id);
        await completePipelineJob(job.id, job.episode_id, "transcription");
        break;

      case "transcript_segmentation":
        if (!job.episode_id)
          throw new Error("transcript_segmentation job missing episode_id");
        await runSegmentationJob(job.id, job.episode_id);
        await completePipelineJob(
          job.id,
          job.episode_id,
          "transcript_segmentation",
        );
        break;

      case "embedding":
        if (!job.episode_id)
          throw new Error("embedding job missing episode_id");
        await runEmbeddingJob(job.id, job.episode_id);
        await completePipelineJob(job.id, job.episode_id, "embedding");
        break;

      case "indexing":
        if (!job.episode_id)
          throw new Error("indexing job missing episode_id");
        await runIndexingJob(job.id, job.episode_id);
        await completePipelineJob(job.id, job.episode_id, "indexing");
        break;

      default:
        throw new Error(`Unknown jobType: ${job.job_type}`);
    }

    return {
      jobId: job.id,
      jobType: job.job_type,
      status: "completed",
    };
  } catch (err: any) {
    const message = err?.message ?? "Unknown worker error";
    try {
      await markJobFailed(job.id, message);
    } catch {
      // ignored — surface the original error
    }
    return {
      jobId: job.id,
      jobType: job.job_type,
      status: "failed",
      error: message,
    };
  }
}

async function runThumbnailCacheJob(jobId: string, episodeId: string | null) {
  if (!episodeId) throw new Error("thumbnail_cache missing episode_id");
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const ep = await db.episode.findUnique({ where: { id: episodeId } });
  if (!ep) throw new Error(`Episode ${episodeId} not found`);
  if (!ep.thumbnailOriginalUrl) {
    return;
  }
  await updateJobStatus(jobId, "running", { progressPercent: 10 });
  const localThumbPath = await cacheThumbnail(ep.id, ep.thumbnailOriginalUrl);
  await db.episode.update({
    where: { id: episodeId },
    data: { thumbnailLocalPath: localThumbPath },
  });
  await updateJobProgress(jobId, 100);
}

async function runDownloadJob(jobId: string, episodeId: string | null) {
  if (!episodeId) throw new Error("download missing episode_id");
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const ep = await db.episode.findUnique({ where: { id: episodeId } });
  if (!ep) throw new Error(`Episode ${episodeId} not found`);

  // The fast-paths below skip the ~50 MB MP3 because a cheaper transcript
  // source is expected to work. Once transcription has actually failed for
  // this episode that assumption is dead, and skipping again would leave
  // Whisper with no audio — bouncing the episode between `download` and
  // `transcription` forever. So: skip only while no attempt has failed.
  const transcriptionAlreadyFailed = await hasFailedTranscription(episodeId);

  if (!transcriptionAlreadyFailed) {
    // Feed transcript available — skip the ~50 MB MP3 download entirely.
    if (ep.transcriptOriginalUrl) {
      await updateJobProgress(jobId, 100);
      return;
    }

    const { shouldSkipYouTubeAudioDownload } = await import(
      "@/lib/transcriptionConfig"
    );
    if (shouldSkipYouTubeAudioDownload(ep.sourcePlatform)) {
      await updateJobProgress(jobId, 100);
      return;
    }
  }

  await updateJobStatus(jobId, "downloading", { progressPercent: 5 });

  const dl = await db.download.create({
    data: {
      sourceId: ep.sourceId,
      episodeId: ep.id,
      downloadType: "audio",
      status: "downloading",
      progressPercent: 5,
      startedAt: new Date(),
    },
  });

  let lastPct = 5;
  let lastWrite = 0;

  const reportProgress = async (pct: number) => {
    const rounded = Math.max(5, Math.min(99, Math.round(pct)));
    const now = Date.now();
    if (rounded <= lastPct && now - lastWrite < 1500) return;
    lastPct = rounded;
    lastWrite = now;
    await Promise.all([
      updateJobProgress(jobId, rounded),
      db.download.update({
        where: { id: dl.id },
        data: { progressPercent: rounded, status: "downloading" },
      }),
    ]);
  };

  try {
    const audioPath =
      ep.sourcePlatform === "rss"
        ? await downloadRssAudio(ep.id, ep.sourceUrl, reportProgress)
        : await downloadAudio(ep.id, ep.sourceUrl, reportProgress);

    // Record the real file size so the Usage page reports measured storage
    // instead of a bitrate estimate. Files are ephemeral; this number persists.
    let audioBytes = 0;
    try {
      audioBytes = fs.statSync(audioPath).size;
    } catch {
      // non-fatal — leave at 0 if we can't stat the file
    }

    await db.episode.update({
      where: { id: episodeId },
      data: {
        audioFilePath: audioPath,
        processingStatus: "downloading",
        ...(audioBytes > 0 ? { audioBytes } : {}),
      },
    });

    await db.download.update({
      where: { id: dl.id },
      data: {
        status: "completed",
        progressPercent: 100,
        filePath: audioPath,
        completedAt: new Date(),
      },
    });

    await updateJobProgress(jobId, 100);
  } catch (err: any) {
    await db.download.update({
      where: { id: dl.id },
      data: {
        status: "failed",
        errorMessage: err?.message ?? "Download failed",
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

/**
 * For YouTube sources, `downloadAudio` already produced an .mp3 — this is
 * a no-op fast-path. For non-YouTube sources or future raw-video uploads,
 * we run ffmpeg via `extractAudioIfNeeded`.
 */
async function runAudioExtractJob(jobId: string, episodeId: string | null) {
  if (!episodeId) throw new Error("audio_extract missing episode_id");
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const ep = await db.episode.findUnique({ where: { id: episodeId } });
  if (!ep) throw new Error(`Episode ${episodeId} not found`);
  if (!ep.audioFilePath) {
    throw new Error("audio_extract: episode has no audio_file_path");
  }

  await updateJobStatus(jobId, "extracting_audio", { progressPercent: 30 });
  const finalPath = await extractAudioIfNeeded(ep.audioFilePath);
  if (finalPath !== ep.audioFilePath) {
    await db.episode.update({
      where: { id: episodeId },
      data: { audioFilePath: finalPath },
    });
  }
  await updateJobProgress(jobId, 100);
}

/**
 * Drain the queue: keep processing until empty (or maxJobs reached).
 * Returns a summary of jobs processed.
 */
export async function processUntilEmpty(opts: {
  workerId?: string;
  maxJobs?: number;
} = {}): Promise<ProcessOnceResult[]> {
  const workerId = opts.workerId ?? DEFAULT_WORKER_ID;
  const maxJobs = opts.maxJobs ?? Number.POSITIVE_INFINITY;

  const { hasDatabase, getDb } = await import("@/lib/db");
  if (!hasDatabase()) {
    console.warn("[worker] DATABASE_URL not set — nothing to process.");
    return [];
  }

  const db = getDb();
  const run = await db.workerRun.create({
    data: { workerName: workerId, startedAt: new Date(), status: "running" },
  });

  const results: ProcessOnceResult[] = [];
  try {
    while (results.length < maxJobs) {
      const r = await processOnce(workerId);
      if (!r) break;
      results.push(r);
      console.log(
        `[worker] ${r.jobType} ${r.status}` +
          (r.error ? ` — ${r.error}` : ""),
      );
    }
    await db.workerRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        jobsProcessed: results.length,
        status: "completed",
        logs: results
          .map((r) => `${r.jobType} ${r.status}${r.error ? ` ${r.error}` : ""}`)
          .join("\n"),
      },
    });
  } catch (err: any) {
    await db.workerRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        jobsProcessed: results.length,
        status: "failed",
        logs: err?.message ?? String(err),
      },
    });
    throw err;
  }
  return results;
}

/**
 * Drain the queue with up to `concurrency` jobs running in parallel.
 *
 * Spawns N independent "lanes"; each lane atomically claims the next queued
 * job (via FOR UPDATE SKIP LOCKED, so claims never collide) and processes it,
 * looping until the queue has no eligible work. Returns when all lanes idle.
 *
 * Throughput scales because most jobs are I/O-bound (yt-dlp downloads, OpenAI
 * calls) and spend their time waiting on the network, not the CPU.
 */
export async function processConcurrently(
  opts: {
    workerId?: string;
    concurrency?: number;
    maxJobs?: number;
  } = {},
): Promise<ProcessOnceResult[]> {
  const baseId = opts.workerId ?? DEFAULT_WORKER_ID;
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const maxJobs = opts.maxJobs ?? Number.POSITIVE_INFINITY;

  const { hasDatabase, getDb } = await import("@/lib/db");
  if (!hasDatabase()) {
    console.warn("[worker] DATABASE_URL not set — nothing to process.");
    return [];
  }

  const db = getDb();
  const run = await db.workerRun.create({
    data: { workerName: baseId, startedAt: new Date(), status: "running" },
  });

  const results: ProcessOnceResult[] = [];
  let started = 0; // jobs committed to (bounds maxJobs across lanes)

  async function lane(laneIdx: number) {
    const laneId = `${baseId}#${laneIdx}`;
    while (started < maxJobs) {
      started++;
      const r = await processOnce(laneId);
      if (!r) {
        started--; // nothing left to claim — let this lane go idle
        return;
      }
      results.push(r);
      console.log(
        `[worker:${laneIdx}] ${r.jobType} ${r.status}` +
          (r.error ? ` — ${r.error}` : ""),
      );
    }
  }

  try {
    await Promise.all(
      Array.from({ length: concurrency }, (_, i) => lane(i)),
    );
    await db.workerRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        jobsProcessed: results.length,
        status: "completed",
        logs: results
          .map((r) => `${r.jobType} ${r.status}${r.error ? ` ${r.error}` : ""}`)
          .join("\n"),
      },
    });
  } catch (err: any) {
    await db.workerRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        jobsProcessed: results.length,
        status: "failed",
        logs: err?.message ?? String(err),
      },
    });
    throw err;
  }
  return results;
}
