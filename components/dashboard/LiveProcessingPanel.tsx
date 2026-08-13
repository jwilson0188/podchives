"use client";

import Link from "next/link";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useDashboardLive } from "./DashboardLiveProvider";

export function LiveProcessingPanel() {
  const { activeJobs, stats, backlogEpisodes } = useDashboardLive();

  return (
    <div className="card p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight">Live processing</h2>
          <p className="text-xs text-text-muted mt-0.5">
            What the worker is doing right now
          </p>
        </div>
        <Link
          href="/processing-queue"
          className="text-xs text-accent hover:text-accent-hover shrink-0"
        >
          Open queue →
        </Link>
      </div>
      {activeJobs.length === 0 ? (
        <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg px-3">
          {stats.queuedJobs > 0 ? (
            <>
              Worker idle —{" "}
              <span className="text-warn font-medium">
                {stats.queuedJobs} jobs
              </span>{" "}
              waiting in queue.
            </>
          ) : backlogEpisodes > 0 ? (
            <>
              Nothing running.{" "}
              <span className="text-warn font-medium">
                {backlogEpisodes} episodes
              </span>{" "}
              still need processing — turn on auto-sync to drain the backlog.
            </>
          ) : (
            "All caught up. Your archive is fully indexed."
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {activeJobs.slice(0, 5).map((j) => (
            <div
              key={j.id}
              className="bg-bg-subtle rounded-lg border border-border p-3 min-w-0 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium break-words [overflow-wrap:anywhere] line-clamp-2 sm:line-clamp-none">
                    {j.episodeTitle}
                  </div>
                  <div className="text-[0.8125rem] text-text-muted font-mono mt-0.5 break-words">
                    {j.podcastName} · {j.jobType.replace(/_/g, " ")}
                  </div>
                </div>
                <StatusBadge status={j.status} className="self-start shrink-0" />
              </div>
              <ProgressBar
                value={j.progressPercent}
                status={
                  j.status === "failed"
                    ? "failed"
                    : j.status === "completed"
                      ? "completed"
                      : "active"
                }
              />
              <div className="mt-1.5 text-[0.8125rem] text-text-muted font-mono tabular-nums">
                {j.progressPercent}%
              </div>
              {j.errorMessage && (
                <ErrorMessage className="mt-2">{j.errorMessage}</ErrorMessage>
              )}
            </div>
          ))}
          {activeJobs.length > 5 && (
            <Link
              href="/processing-queue"
              className="block text-center text-xs text-text-muted hover:text-accent"
            >
              +{activeJobs.length - 5} more active jobs
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
