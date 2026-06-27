import { Suspense } from "react";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { FilterPanel } from "@/components/search/FilterPanel";
import { SearchBarWithQuery } from "@/components/search/SearchBarWithQuery";
import { SearchResultsView } from "@/components/search/SearchResultsView";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPodcasts } from "@/lib/data";

export const metadata = { title: "Search" };

export default async function SearchPage() {
  const archives = await getPodcasts();
  const archiveOptions = archives.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <PageHeader
        eyebrow="archive_search // keyword"
        title="Search"
        description="Find the exact moment a topic, phrase, or quote was said. Every result cites back to its source."
      />

      <div className="mb-6">
        <Suspense
          fallback={<GlobalSearchBar size="lg" autoFocus={false} />}
        >
          <SearchBarWithQuery />
        </Suspense>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)] gap-4 lg:gap-6">
        <Suspense fallback={null}>
          <FilterPanel archives={archiveOptions} />
        </Suspense>

        <Suspense fallback={null}>
          <SearchResultsView archives={archiveOptions} />
        </Suspense>
      </div>
    </div>
  );
}
