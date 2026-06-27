"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useDashboardLive } from "./DashboardLiveProvider";

export function LiveProcessingPanel() {
  const { activeJobs, stats, backlogEpisodes } = useDashboardLive();

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold tracking-tight">Live processing</h2>
          <p className="text-xs text-text-muted mt-0.5">
            What the worker is doing right now
          </p>
        </div>
        <Link
          href="/processing-queue"
          className="text-xs text-accent hover:text-accent-hover"
        >
          Open queue →
        </Link>
      </div>
      {activeJobs.length === 0 ? (
        <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg">
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
              className="bg-bg-subtle rounded-lg border border-border p-3"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {j.episodeTitle}
                  </div>
                  <div className="text-[11px] text-text-muted font-mono mt-0.5">
                    {j.podcastName} · {j.jobType.replace(/_/g, " ")}
                  </div>
                </div>
                <StatusBadge status={j.status} />
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
              <div className="mt-1.5 text-[11px] text-text-muted font-mono tabular-nums">
                {j.progressPercent}%
                {j.errorMessage && (
                  <span className="text-danger ml-2">— {j.errorMessage}</span>
                )}
              </div>
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
