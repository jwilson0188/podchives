"use client";

import Link from "next/link";
import { Collapsible } from "@/components/ui/Collapsible";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { DemoProcessingJob } from "@/lib/demoData";
import { formatRelativeDate } from "@/lib/utils";

export function ProcessingJobRow({ job }: { job: DemoProcessingJob }) {
  const isFailed = job.status === "failed";
  const isCompleted = job.status === "completed";
  const isQueued = job.status === "queued";
  const metaLine = [
    job.podcastName,
    job.jobType.replace(/_/g, " "),
    job.workerId,
  ]
    .filter(Boolean)
    .join(" · ");

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
          {job.workerId ? (
            <Collapsible
              defaultOpen={false}
              className="mt-2 border-border/60 bg-bg-subtle/50"
              headerClassName="px-2 py-1.5"
              contentClassName="px-2 pb-2 pt-0 border-t-0 text-[0.8125rem] text-text-muted font-mono break-all"
              title={
                <span className="text-[0.8125rem] text-text-muted font-mono">
                  {job.podcastName} · {job.jobType.replace(/_/g, " ")}
                </span>
              }
              summary={job.workerId}
            >
              {metaLine}
            </Collapsible>
          ) : (
            <div className="text-[0.8125rem] text-text-muted font-mono mt-0.5 break-words [overflow-wrap:anywhere]">
              {job.podcastName} · {job.jobType.replace(/_/g, " ")}
            </div>
          )}
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

      <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[0.8125rem] text-text-muted font-mono">
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
          <span className="text-[0.8125rem] text-text-muted font-mono">
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
