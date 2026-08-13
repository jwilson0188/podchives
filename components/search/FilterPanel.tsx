"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SearchMode } from "@/lib/search";
import { readSearchUrlParams } from "@/lib/searchFilters";

export type ArchiveOption = { id: string; name: string };

export function FilterPanel({
  archives = [],
  showModeToggle = true,
}: {
  archives?: ArchiveOption[];
  /** Hide mode toggle on Advanced Search — that page has its own mode picker. */
  showModeToggle?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = readSearchUrlParams(searchParams);

  const setParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const reset = () => {
    const q = searchParams.get("q");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <>
      <details className="lg:hidden card mb-4 group">
        <summary className="p-4 cursor-pointer list-none flex items-center justify-between font-semibold text-sm tracking-tight">
          <span>Filters</span>
          <span className="text-text-muted text-xs group-open:hidden">Show</span>
          <span className="text-text-muted text-xs hidden group-open:inline">
            Hide
          </span>
        </summary>
        <div className="px-4 pb-4 border-t border-border pt-4">
          <FilterFields
            archives={archives}
            archive={url.archiveId ?? "all"}
            platform={url.platform ?? "all"}
            dateRange={url.dateRange ?? "all"}
            mode={url.mode ?? "keyword"}
            searchableOnly={url.searchableOnly !== false}
            showModeToggle={showModeToggle}
            setArchive={(v) => setParams({ archive: v })}
            setPlatform={(v) => setParams({ platform: v })}
            setDateRange={(v) => setParams({ range: v })}
            setMode={(v) => setParams({ mode: v === "keyword" ? null : v })}
            setSearchableOnly={(v) =>
              setParams({ searchable: v ? null : "0" })
            }
          />
        </div>
      </details>

      <aside className="hidden lg:block card p-4 sticky top-20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold tracking-tight">Filters</h3>
          <button
            type="button"
            onClick={reset}
            className="text-[0.8125rem] text-text-muted hover:text-text-primary"
          >
            Reset
          </button>
        </div>
        <FilterFields
          archives={archives}
          archive={url.archiveId ?? "all"}
          platform={url.platform ?? "all"}
          dateRange={url.dateRange ?? "all"}
          mode={url.mode ?? "keyword"}
          searchableOnly={url.searchableOnly !== false}
          showModeToggle={showModeToggle}
          setArchive={(v) => setParams({ archive: v })}
          setPlatform={(v) => setParams({ platform: v })}
          setDateRange={(v) => setParams({ range: v })}
          setMode={(v) => setParams({ mode: v === "keyword" ? null : v })}
          setSearchableOnly={(v) => setParams({ searchable: v ? null : "0" })}
        />
      </aside>
    </>
  );
}

function FilterFields({
  archives,
  archive,
  platform,
  dateRange,
  mode,
  searchableOnly,
  showModeToggle,
  setArchive,
  setPlatform,
  setDateRange,
  setMode,
  setSearchableOnly,
}: {
  archives: ArchiveOption[];
  archive: string;
  platform: string;
  dateRange: string;
  mode: SearchMode;
  searchableOnly: boolean;
  showModeToggle: boolean;
  setArchive: (v: string) => void;
  setPlatform: (v: string) => void;
  setDateRange: (v: string) => void;
  setMode: (v: SearchMode) => void;
  setSearchableOnly: (v: boolean) => void;
}) {
  const modes: { id: SearchMode; label: string }[] = [
    { id: "keyword", label: "Keyword" },
    { id: "semantic", label: "Semantic" },
    { id: "hybrid", label: "Hybrid" },
  ];

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
            <option value="rss">RSS</option>
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
          <span className="text-text-muted">Searchable episodes only</span>
        </label>
      </div>

      {showModeToggle && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-[0.75rem] text-text-muted mb-2">
            Search type
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-bg-subtle rounded-md border border-border">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={
                  "text-xs py-1.5 rounded font-medium transition-colors " +
                  (mode === m.id
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-primary")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
