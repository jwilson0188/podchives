import { PageHeader } from "@/components/ui/PageHeader";
import { FilterPanel } from "@/components/search/FilterPanel";
import { getPodcasts } from "@/lib/data";

export const metadata = { title: "Advanced Search" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdvancedSearchPage() {
  const archives = await getPodcasts();
  return (
    <div>
      <PageHeader
        eyebrow="archive_search // advanced"
        title="Advanced Search"
        description="Build a precise query: natural language, filters, archives, date ranges, and semantic similarity (coming soon)."
      />

      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <FilterPanel archives={archives} />

        <div className="space-y-5">
          <section className="card p-5">
            <label className="label">Natural language query</label>
            <textarea
              rows={4}
              placeholder="Describe what you're looking for. Example: any moment where the host pushes back on a guest's claim about distribution being free."
              className="input font-mono text-sm leading-relaxed"
              disabled
            />
            <p className="mt-2 text-[11px] text-text-muted">
              Semantic / NL search ships in Phase 5. For now, use keyword search
              on the main Search page.
            </p>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold tracking-tight mb-4">Modes</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <ModeCard
                title="Keyword"
                desc="Fast literal/full-text search across transcripts."
                active
              />
              <ModeCard
                title="Semantic"
                desc="Vector similarity over segment embeddings (pgvector)."
                badge="Phase 5"
              />
              <ModeCard
                title="Hybrid"
                desc="Combine keyword + semantic with re-ranking."
                badge="Phase 5"
              />
              <ModeCard
                title="Phrase / quote"
                desc="Exact-quote matching for citation-style lookups."
                badge="Phase 4"
              />
            </div>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold tracking-tight mb-3">
              Power query examples
            </h3>
            <ul className="space-y-2 text-sm text-text-muted font-mono">
              <li>
                <span className="text-cyan">topic:</span> infrastructure{" "}
                <span className="text-cyan">archive:</span> "The Roundtable"
              </li>
              <li>
                <span className="text-cyan">phrase:</span> "search becomes a
                conversation"
              </li>
              <li>
                <span className="text-cyan">after:</span> 2026-05-01{" "}
                <span className="text-cyan">platform:</span> youtube
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  title,
  desc,
  active,
  badge,
}: {
  title: string;
  desc: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 transition-colors " +
        (active
          ? "border-accent/60 bg-accent-muted"
          : "border-border bg-bg-subtle")
      }
    >
      <div className="flex items-center justify-between mb-1">
        <div className={"font-semibold " + (active ? "text-accent" : "")}>
          {title}
        </div>
        {badge && (
          <span className="pill bg-bg-elevated text-text-muted border border-border">
            {badge}
          </span>
        )}
        {active && (
          <span className="pill bg-success-muted text-success">active</span>
        )}
      </div>
      <p className="text-xs text-text-muted">{desc}</p>
    </div>
  );
}
