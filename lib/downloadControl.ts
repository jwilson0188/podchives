import type { PrismaClient } from "@prisma/client";
import { ACTIVE_JOB_STATUSES, JobRetryError, retryJob } from "./jobControl";

/** Legacy downloads have no job FK. Fail closed when job history is ambiguous. */
export async function retryDownload(db: PrismaClient, downloadId: string) {
  const download = await db.download.findUnique({ where: { id: downloadId } });
  if (!download) throw new JobRetryError("Download not found", 404);
  const jobs = await db.processingJob.findMany({ where: { episodeId: download.episodeId, jobType: "download", status: "failed" }, select: { id: true } });
  if (jobs.length !== 1) throw new JobRetryError("Use Processing Queue to select the failed job", 409);
  return retryJob(db, jobs[0].id, downloadId);
}

/** Episode-level stop; does not delete media/transcripts or stop other episodes. */
export async function stopDownloadEpisode(db: PrismaClient, downloadId: string) {
  const initial = await db.download.findUnique({ where: { id: downloadId }, include: { episode: { select: { sourceId: true } } } });
  if (!initial) throw new JobRetryError("Download not found", 404);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sources WHERE id=${initial.episode.sourceId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM episodes WHERE id=${initial.episodeId} FOR UPDATE`;
    const download = await tx.download.findUnique({ where: { id: downloadId } });
    if (!download) throw new JobRetryError("Download not found", 404);
    const latest = await tx.download.findMany({ where: { episodeId: initial.episodeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2 });
    if (latest[0]?.id !== downloadId || (latest[1] && latest[1].createdAt.getTime() === latest[0].createdAt.getTime())) throw new JobRetryError("Download history changed; refresh or use Processing Queue", 409);
    if (download.status === "failed" && download.errorMessage === "Stopped by user") {
      const resumed = await tx.processingJob.count({ where: { episodeId: initial.episodeId, status: { in: ["queued", ...ACTIVE_JOB_STATUSES] } } });
      if (resumed) throw new JobRetryError("Episode processing has resumed; refresh the queue", 409);
      return { stopped: true };
    }
    if (!["queued", ...ACTIVE_JOB_STATUSES].includes(download.status)) throw new JobRetryError("This download is no longer active", 409);
    const active = await tx.processingJob.count({ where: { episodeId: initial.episodeId, status: { in: ["queued", ...ACTIVE_JOB_STATUSES] } } });
    if (!active) throw new JobRetryError("No active episode jobs; refresh the queue", 409);
    const data = { status: "failed", errorMessage: "Stopped by user", completedAt: new Date() };
    await tx.processingJob.updateMany({ where: { episodeId: initial.episodeId, status: { in: ["queued", ...ACTIVE_JOB_STATUSES] } }, data });
    await tx.download.updateMany({ where: { episodeId: initial.episodeId, status: { in: ["queued", ...ACTIVE_JOB_STATUSES] } }, data });
    return { stopped: true };
  });
}
