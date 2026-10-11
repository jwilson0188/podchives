import type { Prisma, PrismaClient } from "@prisma/client";
import { PipelineJobNotActiveError } from "./queueTransitions";

export const ACTIVE_JOB_STATUSES = ["running", "downloading", "extracting_audio", "transcribing", "segmenting", "embedding", "indexing"];
export const activeJobWhere = { status: { in: ACTIVE_JOB_STATUSES }, OR: [{ errorMessage: null }, { AND: [
  { errorMessage: { not: "Stopped by user" } }, { NOT: { errorMessage: { startsWith: "superseded:" } } }, { NOT: { errorMessage: { startsWith: "cancelled:" } } },
] }] };

/** All callbacks are short database operations, never network/provider work. */
export async function withActiveJob<T>(db: PrismaClient, jobId: string, scope: { episodeId: string } | { sourceId: string }, write: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async (tx) => {
    if ("episodeId" in scope) await tx.$queryRaw`SELECT id FROM episodes WHERE id=${scope.episodeId} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM sources WHERE id=${scope.sourceId} FOR UPDATE`;
    const job = await tx.processingJob.findFirst({ where: { id: jobId, ...scope, ...activeJobWhere } });
    if (!job) throw new PipelineJobNotActiveError();
    return write(tx);
  });
}

export async function writeJobProgress(db: PrismaClient, jobId: string, data: Prisma.ProcessingJobUpdateManyMutationInput) {
  const changed = await db.processingJob.updateMany({ where: { id: jobId, ...activeJobWhere }, data });
  if (!changed.count) throw new PipelineJobNotActiveError();
  return changed;
}

export class JobRetryError extends Error {
  constructor(message: string, public readonly status: 404 | 409) { super(message); }
}

/** Retire the failed identity; never make a stopped worker's ID active again. */
export async function retryJob(db: PrismaClient, jobId: string) {
  const initial = await db.processingJob.findUnique({ where: { id: jobId }, include: { episode: { select: { sourceId: true } } } });
  if (!initial) throw new JobRetryError("Job not found", 404);
  const sourceId = initial.episode?.sourceId ?? initial.sourceId;
  return db.$transaction(async (tx) => {
    if (sourceId) await tx.$queryRaw`SELECT id FROM sources WHERE id=${sourceId} FOR UPDATE`;
    if (initial.episodeId) await tx.$queryRaw`SELECT id FROM episodes WHERE id=${initial.episodeId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM processing_jobs WHERE id=${jobId} FOR UPDATE`;
    const job = await tx.processingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new JobRetryError("Job not found", 404);
    if (job.status !== "failed" || job.errorMessage?.startsWith("superseded:") || job.errorMessage?.startsWith("cancelled:")) throw new JobRetryError("Only current failed or user-stopped jobs can be retried", 409);
    const scope = job.episodeId ? { episodeId: job.episodeId } : { sourceId: job.sourceId, jobType: "source_sync" };
    if (!job.episodeId && (!job.sourceId || job.jobType !== "source_sync")) throw new JobRetryError("Job has no retryable target", 409);
    const newer = await tx.processingJob.findFirst({ where: { ...scope, id: { not: jobId }, OR: [
      { status: { in: ["queued", ...ACTIVE_JOB_STATUSES] } },
      { createdAt: { gt: job.createdAt }, errorMessage: null },
    ] } });
    if (newer) throw new JobRetryError("Newer or active work exists; refresh the queue", 409);
    await tx.processingJob.update({ where: { id: jobId }, data: { status: "completed", errorMessage: "superseded: explicit retry", completedAt: new Date() } });
    const fresh = await tx.processingJob.create({ data: { episodeId: job.episodeId, sourceId: job.sourceId, jobType: job.jobType, status: "queued", retryCount: job.retryCount + 1 } });
    if (job.jobType === "source_sync" && job.sourceId) await tx.source.update({ where: { id: job.sourceId }, data: { syncStatus: "queued" } });
    return fresh;
  });
}
