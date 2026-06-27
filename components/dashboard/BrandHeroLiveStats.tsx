"use client";

import Link from "next/link";
import { useDashboardLive } from "./DashboardLiveProvider";
import { formatHours, formatNumber } from "@/lib/utils";

export function CoverageRingLive() {
  const { coveragePercent: pct } = useDashboardLive();
  const ringR = 42;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (pct / 100) * ringC;

  return (
    <div className="relative w-[100px] h-[100px] flex-shrink-0">
      <svg
        className="w-full h-full -rotate-90"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r={ringR}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-bg-elevated"
        />
        <circle
          cx="50"
          cy="50"
          r={ringR}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={ringC}
          strokeDashoffset={ringOffset}
          className="text-accent transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-[9px] uppercase tracking-widest text-text-muted">
          searchable
        </span>
      </div>
    </div>
  );
}

export function HeroMetricsLive() {
  const live = useDashboardLive();

  return (
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <Metric
        label="Archived"
        value={formatHours(live.totalHours)}
        sub={`${formatNumber(live.stats.totalEpisodes)} episodes`}
      />
      <Metric
        label="Searchable"
        value={formatHours(live.searchableHours)}
        sub={`${formatNumber(live.stats.searchableEpisodes)} ready`}
        accent
      />
      <Metric
        label="Moments"
        value={formatNumber(live.transcriptMoments)}
        sub="indexed clips"
      />
      {live.backlogEpisodes > 0 && (
        <Metric
          label="Backlog"
          value={formatNumber(live.backlogEpisodes)}
          sub="still processing"
          warn
        />
      )}
    </div>
  );
}

export function WorkerStatusPill() {
  const { stats, workerActive } = useDashboardLive();

  if (stats.failedJobs > 0) {
    return (
      <Link
        href="/processing-queue"
        className="pill bg-danger-muted text-danger border border-danger/30 text-xs"
      >
        {stats.failedJobs} failed
      </Link>
    );
  }
  if (workerActive) {
    return (
      <span className="pill bg-success-muted text-success border border-success/30 text-xs flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        Processing
      </span>
    );
  }
  if (stats.queuedJobs > 0) {
    return (
      <Link
        href="/processing-queue"
        className="pill bg-warn-muted text-warn border border-warn/30 text-xs"
      >
        {stats.queuedJobs} queued
      </Link>
    );
  }
  return (
    <span className="pill bg-bg-elevated text-text-muted border border-border text-xs">
      Idle
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-text-muted">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          accent ? "text-success" : warn ? "text-warn" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-text-dim">{sub}</div>
    </div>
  );
}
