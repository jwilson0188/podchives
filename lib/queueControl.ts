import type { PrismaClient } from "@prisma/client";
import { getTranscriptSegmentIds, TranscriptChangedError } from "./transcriptIntegrity";

/** Source lock is shared with initial episode admission. Automatic eligibility
 * is rechecked inside the transaction; manual requests reuse active work. */
export async function admitSourceSync(db: PrismaClient, sourceId: string, dueBefore?: Date) {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sources WHERE id=${sourceId} FOR UPDATE`;
    if (!locked.length) return null;
    const source = await tx.source.findUniqueOrThrow({ where: { id: sourceId } });
    if (dueBefore && (!source.autoSync || source.syncStatus === "syncing"
      || (source.lastSyncedAt && source.lastSyncedAt >= dueBefore))) return null;
    const active = await tx.processingJob.findFirst({ where: { sourceId, jobType: "source_sync", status: { in: ["queued", "running"] } } });
    if (active) return { job: active, created: false };
    const job = await tx.processingJob.create({ data: { sourceId, jobType: "source_sync", status: "queued" } });
    await tx.source.update({ where: { id: sourceId }, data: { syncStatus: "queued" } });
    return { job, created: true };
  });
}

/** Commit failure before the fallback becomes claimable, so the download
 * worker cannot mistake it for another caption-only fast path. */
export async function admitAudioFallback(db: PrismaClient, episodeId: string, jobId: string, expectedIds: readonly string[], message: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM episodes WHERE id=${episodeId} FOR UPDATE`;
    const job = await tx.processingJob.findUnique({ where: { id: jobId } });
    const ids = await getTranscriptSegmentIds(tx, episodeId);
    const expected = [...expectedIds].sort();
    if (!job || job.episodeId !== episodeId || job.jobType !== "transcription"
      || !["running", "transcribing"].includes(job.status)
      || job.errorMessage?.startsWith("superseded:") || job.errorMessage === "Stopped by user"
      || ids.length !== expectedIds.length || ids.some((id, i) => id !== expected[i])) throw new TranscriptChangedError();
    // Failed reprocessing must not start paid recovery over valid stored text.
    if (ids.length) return false;
    const pending = await tx.processingJob.findFirst({ where: { episodeId, jobType: "download", status: { in: ["queued", "running", "downloading"] } } });
    await tx.processingJob.update({ where: { id: jobId }, data: { status: "failed", errorMessage: message, completedAt: new Date() } });
    await tx.processingJob.updateMany({ where: { episodeId, status: "queued", jobType: { in: ["audio_extract", "transcription", "transcript_segmentation", "embedding", "indexing"] } }, data: { status: "completed", errorMessage: "cancelled: transcription failed", completedAt: new Date(), progressPercent: 0 } });
    if (pending) return false;
    await tx.processingJob.create({ data: { episodeId, jobType: "download", status: "queued" } });
    return true;
  });
}

/** Automatic retries must never undo explicit cancellation or supersession. */
export async function retryAutomaticFailures(db: PrismaClient) {
  return db.processingJob.updateMany({
    where: { status: "failed", retryCount: { lt: 3 }, OR: [
      { errorMessage: null },
      { AND: [{ errorMessage: { not: "Stopped by user" } }, { NOT: { errorMessage: { startsWith: "cancelled:" } } }, { NOT: { errorMessage: { startsWith: "superseded:" } } }] },
    ] },
    data: { status: "queued", progressPercent: 0, startedAt: null, completedAt: null, workerId: null, retryCount: { increment: 1 }, errorMessage: null },
  });
}
