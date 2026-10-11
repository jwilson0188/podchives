import type { Episode, Prisma, PrismaClient } from "@prisma/client";
import type { JobType } from "./constants";
import { getNextPipelineStep, isAudioFilePath } from "./pipeline";
import { getTranscriptionBackend, shouldSkipYouTubeAudioDownload, type TranscriptionBackend } from "./transcriptionConfig";

export const MEDIA_JOB_TYPES = ["thumbnail_cache", "download", "audio_extract"] as const;
const INFLIGHT = ["running", "downloading", "extracting_audio", "transcribing", "segmenting", "embedding", "indexing"];

export class PipelineJobNotActiveError extends Error {
  constructor() {
    super("Pipeline job is no longer active");
    this.name = "PipelineJobNotActiveError";
  }
}

type PipelineEpisode = Pick<Episode, "audioFilePath" | "sourcePlatform" | "transcriptOriginalUrl">;

/** Preserve existing source/audio bypasses; path suffix is not existence proof. */
export function resolvePipelineSuccessor(ep: PipelineEpisode, completed: JobType, backend: TranscriptionBackend): JobType | null {
  let next = getNextPipelineStep(completed);
  while (next) {
    const cheapTranscript = ep.transcriptOriginalUrl || shouldSkipYouTubeAudioDownload(ep.sourcePlatform, backend);
    if (((next === "download" || next === "audio_extract") && cheapTranscript)
      || (next === "audio_extract" && ep.audioFilePath && isAudioFilePath(ep.audioFilePath))) {
      next = getNextPipelineStep(next);
      continue;
    }
    return next;
  }
  return null;
}

async function lockEpisode(tx: Prisma.TransactionClient, episodeId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM episodes WHERE id=${episodeId} FOR UPDATE`;
  if (rows.length !== 1) throw new Error("Pipeline episode does not exist");
}

async function enqueueSuccessor(tx: Prisma.TransactionClient, episodeId: string, completed: JobType, backend: TranscriptionBackend) {
  const episode = await tx.episode.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Pipeline episode does not exist");
  const next = resolvePipelineSuccessor(episode, completed, backend);
  if (!next) return false;
  const existing = await tx.processingJob.findFirst({ where: {
    episodeId, jobType: next,
    OR: [
      { status: { in: ["queued", ...INFLIGHT] }, OR: [
        { errorMessage: null }, { errorMessage: { not: { startsWith: "superseded:" } } },
      ] },
      { status: "completed", errorMessage: null },
    ],
  }, select: { id: true } });
  if (existing) return false;
  await tx.processingJob.create({ data: { episodeId, jobType: next, status: "queued", progressPercent: 0 } });
  return true;
}

/** Existing maintenance enqueue entry point, now serialized with completions. */
export async function enqueuePipelineSuccessor(db: PrismaClient, episodeId: string, completed: JobType, backend = getTranscriptionBackend()) {
  return db.$transaction(async (tx) => {
    await lockEpisode(tx, episodeId);
    return enqueueSuccessor(tx, episodeId, completed, backend);
  }, { timeout: 30_000 });
}

/** Artifact work stays outside; only successor + predecessor state commit here. */
export async function completeMediaPipelineJob(db: PrismaClient, jobId: string, episodeId: string, jobType: string, backend = getTranscriptionBackend()) {
  if (!MEDIA_JOB_TYPES.includes(jobType as typeof MEDIA_JOB_TYPES[number])) {
    throw new Error("Use the generation-guarded transcript transaction for this job type");
  }
  return db.$transaction(async (tx) => {
    await lockEpisode(tx, episodeId);
    const job = await tx.processingJob.findUnique({ where: { id: jobId } });
    if (!job || job.episodeId !== episodeId || job.jobType !== jobType) throw new Error("Pipeline job does not match episode/type");
    if (job.status === "completed" && job.errorMessage === null) return;
    if (!INFLIGHT.includes(job.status) || job.errorMessage?.startsWith("superseded:")) throw new PipelineJobNotActiveError();
    await enqueueSuccessor(tx, episodeId, jobType as JobType, backend);
    await tx.processingJob.update({ where: { id: jobId }, data: {
      status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date(),
    } });
  }, { timeout: 30_000 });
}

/** Serialize failure with completion so a lost acknowledgment cannot cancel success. */
export async function failMediaPipelineJob(db: PrismaClient, episodeId: string, jobId: string, message: string) {
  return db.$transaction(async (tx) => {
    await lockEpisode(tx, episodeId);
    const job = await tx.processingJob.findUnique({ where: { id: jobId } });
    if (!job || job.episodeId !== episodeId || !MEDIA_JOB_TYPES.includes(job.jobType as typeof MEDIA_JOB_TYPES[number])) {
      throw new Error("Pipeline job does not match episode/type");
    }
    if ((job.status === "completed" && job.errorMessage === null) || job.status === "failed") return;
    if (!INFLIGHT.includes(job.status) || job.errorMessage?.startsWith("superseded:")) throw new PipelineJobNotActiveError();
    await tx.processingJob.update({ where: { id: jobId }, data: {
      status: "failed", errorMessage: message, completedAt: new Date(),
    } });
    await tx.processingJob.updateMany({ where: {
      episodeId, status: "queued",
      jobType: { in: ["audio_extract", "transcription", "transcript_segmentation", "embedding", "indexing"] },
    }, data: { status: "completed", progressPercent: 0, errorMessage: `cancelled: ${job.jobType} failed`, completedAt: new Date() } });
  }, { timeout: 30_000 });
}
