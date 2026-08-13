import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterPanel } from "@/components/search/FilterPanel";
import { AdvancedSearchPanel } from "@/components/search/AdvancedSearchPanel";
import { getPodcasts } from "@/lib/data";

export const metadata = { title: "Advanced Search" };

export default async function AdvancedSearchPage() {
  const archives = await getPodcasts();
  const archiveOptions = archives.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <PageHeader
        title="Advanced Search"
        description="Build a precise query: natural language, filters, archives, and semantic similarity over your transcripts."
      />

      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <Suspense fallback={null}>
          <FilterPanel archives={archiveOptions} showModeToggle={false} />
        </Suspense>

        <Suspense fallback={null}>
          <AdvancedSearchPanel />
        </Suspense>
      </div>
    </div>
  );
}
