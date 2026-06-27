import type { BackfillEstimate, CockpitSummary } from "@/lib/data";
import { BackfillCostHint } from "./BackfillCostHint";
import {
  CoverageRingLive,
  HeroActiveJobsStrip,
  HeroPipelineBar,
  HeroStatGrid,
  HeroStatusRow,
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
    <section className="card overflow-hidden mb-6 relative min-w-0">
      <div className="absolute inset-0 terminal-grid opacity-30 pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-accent/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-success/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative p-4 sm:p-5 lg:p-7 min-w-0">
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5 min-w-0">
            <div className="flex items-center gap-4 sm:gap-5 shrink-0 mx-auto sm:mx-0">
              <CoverageRingLive />

              {cover && !multiBrand && (
                <div className="hidden sm:block w-14 h-14 rounded-lg overflow-hidden border border-border flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left">
              <HeroEyebrow multiBrand={multiBrand} />
              <HeroTitle title={title} />
              <HeroSubtitle text={subtitle} />
              <HeroStatusRow />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 min-w-0">
            {showBackfillHint && (
              <BackfillCostHint initial={backfillInitial} />
            )}
            {actions}
          </div>
        </div>

        <HeroPipelineBar />
        <HeroStatGrid />
        <HeroActiveJobsStrip />
      </div>
    </section>
  );
}

function HeroEyebrow({ multiBrand }: { multiBrand: boolean }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium mb-1">
      {multiBrand ? "podchives // library" : "podchives // your brand"}
    </div>
  );
}

function HeroTitle({ title }: { title: string }) {
  return (
    <h1 className="text-xl sm:text-2xl lg:text-[1.75rem] font-semibold tracking-tight text-text-primary leading-tight break-words">
      {title}
    </h1>
  );
}

function HeroSubtitle({ text }: { text: string }) {
  return (
    <p className="text-sm text-text-muted mt-1 max-w-xl line-clamp-3 sm:line-clamp-2 mx-auto sm:mx-0">
      {text}
    </p>
  );
}
