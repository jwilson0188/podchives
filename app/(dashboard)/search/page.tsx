import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { FilterPanel } from "@/components/search/FilterPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPodcasts, runSearch } from "@/lib/data";
import { saveSearchQuery } from "@/lib/search";
import { demoSearchResults } from "@/lib/demoData";
import { IS_DEMO_MODE } from "@/lib/constants";

export const metadata = { title: "Search" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; archive?: string };
}) {
  const query = (searchParams.q ?? "").trim();
  const archiveId =
    searchParams.archive && searchParams.archive !== "all"
      ? searchParams.archive
      : undefined;

  const [archives, results] = await Promise.all([
    getPodcasts(),
    query
      ? runSearch(query, { limit: 50, archiveId })
      : Promise.resolve(IS_DEMO_MODE ? demoSearchResults : []),
  ]);

  const archiveName = archiveId
    ? archives.find((a) => a.id === archiveId)?.name
    : undefined;

  // Log analytics in real mode. Failures are non-fatal — the search itself
  // already returned, this is just for the Recent Searches panel.
  if (query && !IS_DEMO_MODE) {
    saveSearchQuery({
      query,
      filters: { limit: 50, archiveId },
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
          archiveId={archiveId}
          placeholder="e.g. 'boring infrastructure'  ·  'open source AI'  ·  exact phrase"
        />
        {query && (
          <div className="mt-3 text-xs text-text-muted font-mono">
            <span className="text-text-dim">query →</span>{" "}
            <span className="text-text-primary">"{query}"</span>{" "}
            <span className="text-text-dim">·</span> {results.length} match
            {results.length === 1 ? "" : "es"}
            {archiveName && (
              <>
                {" "}
                <span className="text-text-dim">in</span>{" "}
                <span className="text-cyan">{archiveName}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)] gap-4 lg:gap-6">
        <FilterPanel archives={archives} />

        <div className="space-y-3 min-w-0">
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
