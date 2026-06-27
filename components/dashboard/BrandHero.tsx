import Link from "next/link";
import type { CockpitSummary } from "@/lib/data";
import { formatHours, formatNumber } from "@/lib/utils";

export function BrandHero({
  cockpit,
  actions,
}: {
  cockpit: CockpitSummary;
  actions?: React.ReactNode;
}) {
  const primary = cockpit.archives[0] ?? null;
  const multiBrand = cockpit.archives.length > 1;
  const title = multiBrand
    ? "Your Library"
    : primary?.name ?? "Your Archive";
  const subtitle = multiBrand
    ? `${cockpit.archives.length} archives · ${cockpit.sources.length} sources connected`
    : primary?.description ||
      "Every episode transcribed, indexed, and searchable — your content library, on demand.";
  const cover = primary?.coverImageUrl;

  const pct = cockpit.coveragePercent;
  const ringR = 42;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC - (pct / 100) * ringC;

  return (
    <section className="card overflow-hidden mb-6 relative">
      <div className="absolute inset-0 terminal-grid opacity-40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-5 lg:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          {/* Coverage ring + cover */}
          <div className="flex items-center gap-5 flex-shrink-0">
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

            {cover && !multiBrand && (
              <div className="hidden sm:block w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Brand copy */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium mb-1">
                  {multiBrand ? "podchives // library" : "podchives // your brand"}
                </div>
                <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-text-primary">
                  {title}
                </h1>
                <p className="text-sm text-text-muted mt-1.5 max-w-xl line-clamp-2">
                  {subtitle}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end sm:justify-start">
                <WorkerPill active={cockpit.workerActive} stats={cockpit.stats} />
                {actions}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Metric
                label="Archived"
                value={formatHours(cockpit.totalHours)}
                sub={`${formatNumber(cockpit.stats.totalEpisodes)} episodes`}
              />
              <Metric
                label="Searchable"
                value={formatHours(cockpit.searchableHours)}
                sub={`${formatNumber(cockpit.stats.searchableEpisodes)} ready`}
                accent
              />
              <Metric
                label="Moments"
                value={formatNumber(cockpit.transcriptMoments)}
                sub="indexed clips"
              />
              {cockpit.backlogEpisodes > 0 && (
                <Metric
                  label="Backlog"
                  value={formatNumber(cockpit.backlogEpisodes)}
                  sub="still processing"
                  warn
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
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

function WorkerPill({
  active,
  stats,
}: {
  active: boolean;
  stats: CockpitSummary["stats"];
}) {
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
  if (active) {
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
