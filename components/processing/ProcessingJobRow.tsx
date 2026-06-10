import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { DemoProcessingJob } from "@/lib/demoData";
import { formatRelativeDate } from "@/lib/utils";

export function ProcessingJobRow({ job }: { job: DemoProcessingJob }) {
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";
  const isQueued = job.status === "queued";

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/episodes/${job.episodeId}`}
            className="font-medium text-text-primary hover:text-accent transition-colors block truncate"
          >
            {job.episodeTitle}
          </Link>
          <div className="text-[11px] text-text-muted font-mono mt-0.5">
            {job.podcastName} · {job.jobType.replace(/_/g, " ")}
            {job.workerId && <> · {job.workerId}</>}
          </div>
        </div>
        <StatusBadge status={job.status} />
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

      <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted font-mono">
        <span className="tabular-nums">{job.progressPercent}%</span>
        <span>
          {job.completedAt
            ? `done ${formatRelativeDate(job.completedAt)}`
            : job.startedAt
              ? `started ${formatRelativeDate(job.startedAt)}`
              : `queued ${formatRelativeDate(job.createdAt)}`}
        </span>
      </div>

      {job.errorMessage && (
        <div className="mt-3 px-3 py-2 rounded-md bg-danger-muted border border-danger/30 text-xs font-mono text-danger flex items-start gap-2">
          <svg
            className="w-3.5 h-3.5 shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
          <span>{job.errorMessage}</span>
        </div>
      )}

      {(isFailed || job.retryCount > 0) && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-text-muted font-mono">
            {job.retryCount > 0 && `retries: ${job.retryCount}`}
          </span>
          {isFailed && (
            <button className="btn-danger text-xs">Retry job</button>
          )}
        </div>
      )}
    </div>
  );
}
