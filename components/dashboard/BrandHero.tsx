import type { BackfillEstimate, CockpitSummary } from "@/lib/data";
import { BackfillCostHint } from "./BackfillCostHint";
import {
  CoverageRingLive,
  HeroMetricsLive,
  WorkerStatusPill,
} from "./BrandHeroLiveStats";

export function BrandHero({
  cockpit,
  actions,
  backfillInitial,
  showBackfillHint,
}: {
  cockpit: CockpitSummary;
  actions?: React.ReactNode;
  backfillInitial?: BackfillEstimate;
  showBackfillHint?: boolean;
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

  return (
    <section className="card overflow-hidden mb-6 relative">
      <div className="absolute inset-0 terminal-grid opacity-40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-5 lg:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          <div className="flex items-center gap-5 flex-shrink-0">
            <CoverageRingLive />

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
                {showBackfillHint && (
                  <BackfillCostHint initial={backfillInitial} />
                )}
                <WorkerStatusPill />
                {actions}
              </div>
            </div>

            <HeroMetricsLive />
          </div>
        </div>
      </div>
    </section>
  );
}
