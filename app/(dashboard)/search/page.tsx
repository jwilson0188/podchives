import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { FilterPanel } from "@/components/search/FilterPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { runSearch } from "@/lib/data";
import { saveSearchQuery } from "@/lib/search";
import { demoSearchResults } from "@/lib/demoData";
import { IS_DEMO_MODE } from "@/lib/constants";

export const metadata = { title: "Search" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = (searchParams.q ?? "").trim();
  const results = query
    ? await runSearch(query, { limit: 50 })
    : IS_DEMO_MODE
      ? demoSearchResults
      : [];

  // Log analytics in real mode. Failures are non-fatal — the search itself
  // already returned, this is just for the Recent Searches panel.
  if (query && !IS_DEMO_MODE) {
    saveSearchQuery({
      query,
      filters: { limit: 50 },
      resultCount: results.length,
    }).catch(() => {});
  }

  return (
    <div>
      <PageHeader
        eyebrow="archive_search // keyword"
        title="Search"
        description="Find the exact moment a topic, phrase, or quote was said. Every result cites back to its source."
      />

      <div className="mb-6">
        <GlobalSearchBar
          size="lg"
          autoFocus={!query}
          defaultValue={query}
          placeholder="e.g. 'boring infrastructure'  ·  'open source AI'  ·  exact phrase"
        />
        {query && (
          <div className="mt-3 text-xs text-text-muted font-mono">
            <span className="text-text-dim">query →</span>{" "}
            <span className="text-text-primary">"{query}"</span>{" "}
            <span className="text-text-dim">·</span> {results.length} match
            {results.length === 1 ? "" : "es"}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <FilterPanel />

        <div className="space-y-3">
          {results.length === 0 && query && (
            <EmptyState
              title={`No matches for "${query}"`}
              description="Try a different phrase, fewer words, or remove filters. Semantic search ships next."
            />
          )}

          {results.length === 0 && !query && (
            <EmptyState
              title="Start with a question"
              description="Search every transcript across every archive. Each result links to the exact moment in the episode."
            />
          )}

          {results.map((r) => (
            <SearchResultCard key={r.id} result={r} query={query} />
          ))}
        </div>
      </div>
    </div>
  );
}
