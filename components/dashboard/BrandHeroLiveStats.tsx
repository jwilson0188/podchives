"use client";

import Link from "next/link";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useDashboardLive } from "./DashboardLiveProvider";
import {
  formatCompactNumber,
  formatHours,
  formatNumber,
} from "@/lib/utils";

function coverageFraction(searchable: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, (searchable / total) * 100);
}

function coverageLabel(pct: number, searchable: number): string {
  if (searchable <= 0) return "0%";
  if (pct > 0 && pct < 1) return `${pct.toFixed(1)}%`;
  if (pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

export function CoverageRingLive() {
  const live = useDashboardLive();
  const total = live.stats.totalEpisodes || 1;
  const searchable = live.stats.searchableEpisodes;
  const pct = coverageFraction(searchable, total);
  const ringR = 42;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (pct / 100) * ringC;
  const busy = live.workerActive || live.stats.activeJobs > 0;

  return (
    <div className="relative w-[108px] h-[108px] flex-shrink-0">
      {busy && (
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-accent/10 animate-pulse blur-md"
        />
      )}
      <svg
        className="w-full h-full -rotate-90 relative"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r={ringR}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-line"
        />
        <circle
          cx="50"
          cy="50"
          r={ringR}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={ringC}
          strokeDashoffset={ringOffset}
          className={`transition-all duration-1000 ${
            pct >= 50
              ? "text-success"
              : pct > 0
                ? "text-accent"
                : "text-text-dim"
          }`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums leading-none">
          {coverageLabel(pct, searchable)}
        </span>
        <span className="text-[0.625rem] text-ink-muted mt-1">
          searchable
        </span>
      </div>
    </div>
  );
}

export function HeroStatusRow() {
  const { stats, workerActive } = useDashboardLive();

  return (
    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
      {workerActive || stats.activeJobs > 0 ? (
        <Link
          href="/processing-queue"
          className="pill bg-success-muted text-success border border-success/30 text-[0.75rem] flex items-center gap-1.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          {stats.activeJobs > 0
            ? `${formatCompactNumber(stats.activeJobs)} active`
            : "Processing"}
        </Link>
      ) : stats.queuedJobs > 0 ? (
        <Link
          href="/processing-queue"
          className="pill bg-warn-muted text-warn border border-warn/30 text-[0.75rem]"
        >
          {formatCompactNumber(stats.queuedJobs)} queued
        </Link>
      ) : (
        <span className="pill bg-bg-elevated text-text-muted border border-border text-[0.75rem]">
          Worker idle
        </span>
      )}

      {stats.failedJobs > 0 && (
        <Link
          href="/processing-queue"
          className="text-[0.75rem] text-text-muted hover:text-danger border border-border rounded-full px-2.5 py-1 bg-bg-subtle transition-colors"
          title="Historical failed jobs — open queue to review or retry"
        >
          {formatCompactNumber(stats.failedJobs)} past failures →
        </Link>
      )}
    </div>
  );
}

export function HeroPipelineBar() {
  const live = useDashboardLive();
  const total = live.stats.totalEpisodes || 1;
  const searchable = live.stats.searchableEpisodes;
  const transcribed = live.transcribedEpisodes;
  const indexing = Math.max(0, transcribed - searchable);
  const waiting = Math.max(0, total - transcribed);
  const busy = live.workerActive || live.stats.activeJobs > 0;

  const segments = [
    {
      key: "searchable",
      count: searchable,
      pct: (searchable / total) * 100,
      color: "bg-success",
      label: "Searchable",
    },
    {
      key: "indexing",
      count: indexing,
      pct: (indexing / total) * 100,
      color: busy ? "bg-cyan animate-progress-glow" : "bg-cyan",
      label: "Indexing",
    },
    {
      key: "waiting",
      count: waiting,
      pct: (waiting / total) * 100,
      color: "bg-line",
      label: "Waiting",
    },
  ].filter((s) => s.count > 0);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[0.8125rem] text-ink-secondary font-medium">
          Archive pipeline
        </div>
        <Link
          href="/processing-queue"
          className="text-[0.75rem] text-accent hover:text-accent-hover"
        >
          Open queue →
        </Link>
      </div>

      <div className="h-2 rounded-full bg-sunken border border-line overflow-hidden flex">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`h-full ${s.color} transition-all duration-700 relative overflow-hidden`}
            style={{ width: `${Math.max(s.pct, s.count > 0 ? 0.4 : 0)}%` }}
            title={`${s.label}: ${formatNumber(s.count)}`}
          >
            {busy && s.key === "indexing" && (
              <div
                aria-hidden
                className="absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-progress-shimmer"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-1.5 text-[0.75rem] text-text-muted"
          >
            <span className={`w-2 h-2 rounded-sm ${s.color.split(" ")[0]}`} />
            <span>
              {s.label}{" "}
              <span className="text-text-dim tabular-nums">
                {formatCompactNumber(s.count)}
              </span>
            </span>
          </div>
        ))}
        {live.backlogEpisodes > 0 && (
          <span className="text-[0.75rem] text-warn/90 tabular-nums">
            {formatCompactNumber(live.backlogEpisodes)} still processing
          </span>
        )}
      </div>
    </div>
  );
}

export function HeroStatGrid() {
  const live = useDashboardLive();
  const total = live.stats.totalEpisodes || 1;
  const searchablePct = coverageFraction(
    live.stats.searchableEpisodes,
    total,
  );

  const tiles = [
    {
      label: "Archived",
      value: formatHours(live.totalHours),
      sub: `${formatNumber(live.stats.totalEpisodes)} episodes`,
      bar: 100,
      barColor: "bg-text-dim",
    },
    {
      label: "Searchable",
      value: formatHours(live.searchableHours),
      sub: `${formatNumber(live.stats.searchableEpisodes)} ready`,
      bar: searchablePct,
      barColor: "bg-success",
    },
    {
      label: "Moments",
      value: formatNumber(live.transcriptMoments),
      sub: "indexed clips",
      bar:
        live.stats.searchableEpisodes > 0
          ? Math.min(
              100,
              (live.transcriptMoments /
                Math.max(live.stats.searchableEpisodes * 40, 1)) *
                100,
            )
          : 0,
      barColor: "bg-accent",
    },
    {
      label: "Backlog",
      value: formatNumber(live.backlogEpisodes),
      sub:
        live.backlogEpisodes === 0
          ? "fully indexed"
          : live.stats.queuedJobs > 0
            ? `${formatCompactNumber(live.stats.queuedJobs)} in queue`
            : "awaiting pipeline",
      bar: Math.min(100, (live.backlogEpisodes / total) * 100),
      barColor: "bg-warn",
      valueClass: live.backlogEpisodes > 0 ? "text-caution" : "text-ink-muted",
    },
  ];

  // Bars were decorative — "Moments" scaled against an invented denominator.
  // The pipeline bar above already carries progress, so the tiles just read
  // as numbers.
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0">
          <dt className="text-[0.8125rem] text-ink-secondary">{t.label}</dt>
          <dd
            className={`mt-1 text-[1.5rem] font-semibold leading-none tracking-[-0.02em] tabular ${t.valueClass ?? "text-ink"}`}
          >
            {t.value}
          </dd>
          <dd className="mt-1 text-[0.8125rem] text-ink-muted truncate">
            {t.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function HeroActiveJobsStrip() {
  const { activeJobs, workerActive } = useDashboardLive();
  if (!workerActive && activeJobs.length === 0) return null;

  const shown = activeJobs.slice(0, 3);

  return (
    <div className="mt-5 pt-5 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[0.8125rem] text-ink-secondary font-medium flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Live now
        </div>
        {activeJobs.length > 3 && (
          <Link
            href="/processing-queue"
            className="text-[0.75rem] text-text-muted hover:text-accent"
          >
            +{activeJobs.length - 3} more →
          </Link>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {shown.map((job) => (
          <Link
            key={job.id}
            href={`/episodes/${job.episodeId}`}
            className="rounded-lg border border-border bg-bg-subtle/60 px-3 py-2.5 hover:border-border-strong transition-colors min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">
                  {job.episodeTitle}
                </div>
                <div className="text-[0.75rem] text-text-muted font-mono mt-0.5">
                  {job.jobType.replace(/_/g, " ")}
                </div>
              </div>
              <span className="text-[0.75rem] text-text-muted tabular-nums shrink-0">
                {job.progressPercent}%
              </span>
            </div>
            <ProgressBar value={job.progressPercent} status="active" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** @deprecated Use HeroStatusRow — kept for any external imports. */
export function WorkerStatusPill() {
  return <HeroStatusRow />;
}

/** @deprecated Use HeroStatGrid — kept for any external imports. */
export function HeroMetricsLive() {
  return (
    <>
      <HeroPipelineBar />
      <HeroStatGrid />
      <HeroActiveJobsStrip />
    </>
  );
}
