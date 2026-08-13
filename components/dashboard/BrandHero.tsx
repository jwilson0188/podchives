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
    <p className="mb-1 text-[0.8125rem] text-ink-muted">
      {multiBrand ? "Your library" : "Your archive"}
    </p>
  );
}

function HeroTitle({ title }: { title: string }) {
  return (
    <h1 className="title-page break-words [overflow-wrap:anywhere]">{title}</h1>
  );
}

function HeroSubtitle({ text }: { text: string }) {
  return (
    <p className="mx-auto mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-secondary line-clamp-3 sm:mx-0 sm:line-clamp-2">
      {text}
    </p>
  );
}
