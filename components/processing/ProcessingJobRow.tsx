import Link from "next/link";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { DemoProcessingJob } from "@/lib/demoData";
import { formatRelativeDate } from "@/lib/utils";

export function ProcessingJobRow({ job }: { job: DemoProcessingJob }) {
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";
  const isQueued = job.status === "queued";

  return (
    <div className="card p-3 sm:p-4 min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3 min-w-0">
        <div className="min-w-0 flex-1">
          <Link
            href={`/episodes/${job.episodeId}`}
            className="font-medium text-text-primary hover:text-accent transition-colors block break-words [overflow-wrap:anywhere] line-clamp-2 sm:line-clamp-none"
          >
            {job.episodeTitle}
          </Link>
          <div className="text-[11px] text-text-muted font-mono mt-0.5 break-words [overflow-wrap:anywhere]">
            {job.podcastName} · {job.jobType.replace(/_/g, " ")}
            {job.workerId && (
              <>
                {" "}
                · <span className="break-all">{job.workerId}</span>
              </>
            )}
          </div>
        </div>
        <StatusBadge status={job.status} className="self-start shrink-0" />
      </div>

      <ProgressBar
        value={job.progressPercent}
        status={
          isFailed
            ? "failed"
            : isCompleted
              ? "completed"
              : isQueued
                ? "queued"
                : "active"
        }
      />

      <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-text-muted font-mono">
        <span className="tabular-nums">{job.progressPercent}%</span>
        <span className="break-words">
          {job.completedAt
            ? `done ${formatRelativeDate(job.completedAt)}`
            : job.startedAt
              ? `started ${formatRelativeDate(job.startedAt)}`
              : `queued ${formatRelativeDate(job.createdAt)}`}
        </span>
      </div>

      {job.errorMessage && (
        <ErrorMessage className="mt-3">{job.errorMessage}</ErrorMessage>
      )}

      {(isFailed || job.retryCount > 0) && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-[11px] text-text-muted font-mono">
            {job.retryCount > 0 && `retries: ${job.retryCount}`}
          </span>
          {isFailed && (
            <button className="btn-danger text-xs w-full sm:w-auto">
              Retry job
            </button>
          )}
        </div>
      )}
    </div>
  );
}
