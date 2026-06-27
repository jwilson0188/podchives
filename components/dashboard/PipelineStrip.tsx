import Link from "next/link";
import type { CockpitSummary } from "@/lib/data";
import { formatNumber } from "@/lib/utils";

/** Visual funnel: ingested → transcribed → searchable. */
export function PipelineStrip({ cockpit }: { cockpit: CockpitSummary }) {
  const { stats, transcribedEpisodes } = cockpit;
  const total = stats.totalEpisodes || 1;
  const stages = [
    {
      label: "Ingested",
      value: stats.totalEpisodes,
      pct: 100,
      color: "bg-text-dim",
    },
    {
      label: "Transcribed",
      value: transcribedEpisodes,
      pct: Math.round((transcribedEpisodes / total) * 100),
      color: "bg-cyan",
    },
    {
      label: "Searchable",
      value: stats.searchableEpisodes,
      pct: cockpit.coveragePercent,
      color: "bg-success",
    },
  ];

  return (
    <section className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold tracking-tight">Archive pipeline</h2>
          <p className="text-xs text-text-muted mt-0.5">
            How much of your catalog is fully indexed and ready to search.
          </p>
        </div>
        <Link
          href="/processing-queue"
          className="text-xs text-accent hover:text-accent-hover"
        >
          Queue →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {stages.map((s) => (
          <div
            key={s.label}
            className="bg-bg-subtle rounded-lg border border-border p-3 text-center"
          >
            <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">
              {s.label}
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatNumber(s.value)}
            </div>
            <div className="mt-2 h-1 rounded-full bg-bg-elevated overflow-hidden">
              <div
                className={`h-full rounded-full ${s.color} transition-all duration-700`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
            <div className="text-[10px] text-text-dim mt-1 tabular-nums">
              {s.pct}%
            </div>
          </div>
        ))}
      </div>

      {cockpit.backlogEpisodes > 0 && (
        <p className="text-xs text-text-muted text-center">
          <span className="text-warn font-medium">
            {formatNumber(cockpit.backlogEpisodes)} episodes
          </span>{" "}
          still in the pipeline — flip{" "}
          <span className="text-accent">auto-sync</span> on to keep draining the
          backlog.
        </p>
      )}
    </section>
  );
}
