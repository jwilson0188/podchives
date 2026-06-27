"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ArchiveOption = { id: string; name: string };

export function FilterPanel({ archives = [] }: { archives?: ArchiveOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const archive = searchParams.get("archive") ?? "all";
  const [platform, setPlatform] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [searchableOnly, setSearchableOnly] = useState(true);

  // The archive filter is URL-driven so the server component re-runs the
  // search scoped to that archive. Other filters are cosmetic for now.
  const setArchive = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("archive");
    else params.set("archive", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <>
      {/* Mobile: collapsible filters */}
      <details className="lg:hidden card mb-4 group">
        <summary className="p-4 cursor-pointer list-none flex items-center justify-between font-semibold text-sm tracking-tight">
          <span>Filters</span>
          <span className="text-text-muted text-xs group-open:hidden">Show</span>
          <span className="text-text-muted text-xs hidden group-open:inline">Hide</span>
        </summary>
        <div className="px-4 pb-4 border-t border-border pt-4">
          <FilterFields
            archives={archives}
            archive={archive}
            setArchive={setArchive}
            platform={platform}
            setPlatform={setPlatform}
            dateRange={dateRange}
            setDateRange={setDateRange}
            searchableOnly={searchableOnly}
            setSearchableOnly={setSearchableOnly}
          />
        </div>
      </details>

      {/* Desktop: sticky sidebar */}
      <aside className="hidden lg:block card p-4 sticky top-20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold tracking-tight">Filters</h3>
          <button
            type="button"
            onClick={() => {
              setArchive("all");
              setPlatform("all");
              setDateRange("all");
              setSearchableOnly(true);
            }}
            className="text-[11px] text-text-muted hover:text-text-primary uppercase tracking-wider"
          >
            Reset
          </button>
        </div>
        <FilterFields
          archives={archives}
          archive={archive}
          setArchive={setArchive}
          platform={platform}
          setPlatform={setPlatform}
          dateRange={dateRange}
          setDateRange={setDateRange}
          searchableOnly={searchableOnly}
          setSearchableOnly={setSearchableOnly}
        />
      </aside>
    </>
  );
}

function FilterFields({
  archives,
  archive,
  setArchive,
  platform,
  setPlatform,
  dateRange,
  setDateRange,
  searchableOnly,
  setSearchableOnly,
}: {
  archives: ArchiveOption[];
  archive: string;
  setArchive: (v: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  dateRange: string;
  setDateRange: (v: string) => void;
  searchableOnly: boolean;
  setSearchableOnly: (v: boolean) => void;
}) {
  return (
    <>
      <div className="space-y-4">
        <div>
          <label className="label">Archive</label>
          <select
            className="input"
            value={archive}
            onChange={(e) => setArchive(e.target.value)}
          >
            <option value="all">All archives</option>
            {archives.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Source platform</label>
          <select
            className="input"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="all">All platforms</option>
            <option value="youtube">YouTube</option>
            <option value="rss" disabled>
              RSS (coming soon)
            </option>
            <option value="manual" disabled>
              Manual upload (coming soon)
            </option>
          </select>
        </div>

        <div>
          <label className="label">Date range</label>
          <select
            className="input"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>

        <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={searchableOnly}
            onChange={(e) => setSearchableOnly(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-text-muted">
            Searchable episodes only
          </span>
        </label>
      </div>

      <div className="mt-5 pt-4 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2">
          Search type
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 bg-bg-subtle rounded-md border border-border">
          <button
            type="button"
            className="text-xs py-1.5 rounded bg-accent text-white font-medium"
          >
            Keyword
          </button>
          <button
            type="button"
            disabled
            className="text-xs py-1.5 rounded text-text-muted cursor-not-allowed"
            title="Semantic search ships in Phase 5"
          >
            Semantic (soon)
          </button>
        </div>
      </div>
    </>
  );
}
