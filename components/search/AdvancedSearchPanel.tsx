"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SearchResultView } from "@/lib/data";
import type { SearchMode } from "@/lib/search";
import {
  buildSearchQueryString,
  parseSearchMode,
  readSearchUrlParams,
} from "@/lib/searchFilters";
import {
  getCachedSearch,
  searchCacheKey,
  setCachedSearch,
} from "@/lib/searchCache";

const MODES: { id: SearchMode; title: string; desc: string }[] = [
  {
    id: "keyword",
    title: "Keyword",
    desc: "Fast literal/full-text search across transcripts.",
  },
  {
    id: "semantic",
    title: "Semantic",
    desc: "Vector similarity over segment embeddings (pgvector).",
  },
  {
    id: "hybrid",
    title: "Hybrid",
    desc: "Combine keyword + semantic with re-ranking.",
  },
];

const EXAMPLES = [
  "any moment where the host pushes back on a guest's claim",
  "discussion about the NBA playoffs and championship odds",
  "phrase: \"search becomes a conversation\"",
];

export function AdvancedSearchPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const url = readSearchUrlParams(searchParams);

  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const mode: SearchMode = searchParams.get("mode")
    ? parseSearchMode(searchParams.get("mode"))
    : "semantic";

  const [results, setResults] = useState<SearchResultView[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(Boolean(initialQ.trim()));
  const [error, setError] = useState<string | null>(null);

  const cacheKey = useMemo(
    () =>
      query.trim()
        ? searchCacheKey(query.trim(), {
            archive: url.archiveId,
            platform: url.platform,
            range: url.dateRange,
            mode,
            searchableOnly: url.searchableOnly,
          })
        : "",
    [query, url, mode],
  );

  const runSearch = async (qOverride?: string) => {
    const q = (qOverride ?? query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    const qs = buildSearchQueryString({
      q,
      archiveId: url.archiveId,
      platform: url.platform,
      dateRange: url.dateRange,
      mode,
      searchableOnly: url.searchableOnly,
    });

    try {
      const res = await fetch(`/api/search?${qs}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Search failed");
      }
      setResults(data.results ?? []);
      if (cacheKey) setCachedSearch(cacheKey, data.results ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const setMode = (next: SearchMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "keyword") params.delete("mode");
    else params.set("mode", next);
    const qs = params.toString();
    router.push(qs ? `/advanced-search?${qs}` : "/advanced-search");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const qs = buildSearchQueryString({
      q,
      archiveId: url.archiveId,
      platform: url.platform,
      dateRange: url.dateRange,
      mode,
      searchableOnly: url.searchableOnly,
    });
    router.replace(`/advanced-search?${qs}`);
  };

  useEffect(() => {
    const q = (searchParams.get("q") ?? "").trim();
    setQuery(q);
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }

    const key = searchCacheKey(q, {
      archive: url.archiveId,
      platform: url.platform,
      range: url.dateRange,
      mode,
      searchableOnly: url.searchableOnly,
    });
    const cached = getCachedSearch(key);
    if (cached) {
      setResults(cached);
      setSearched(true);
      return;
    }
    void runSearch(q);
  }, [
    searchParams,
    url.archiveId,
    url.platform,
    url.dateRange,
    url.searchableOnly,
    mode,
  ]);

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <div>
          <label className="label" htmlFor="nl-query">
            Natural language query
          </label>
          <textarea
            id="nl-query"
            rows={4}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe what you're looking for. Example: any moment where the host pushes back on a guest's claim about distribution being free."
            className="input font-mono text-sm leading-relaxed min-h-[120px]"
          />
          <p className="mt-2 text-[0.8125rem] text-text-muted">
            Semantic search finds meaning, not just exact words. Sidebar filters
            (archive, platform, date) apply to every search.
          </p>
        </div>

        <div>
          <div className="text-[0.75rem] text-text-muted mb-2">
            Search mode
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={
                    "rounded-lg border p-4 text-left transition-colors " +
                    (active
                      ? "border-accent/60 bg-accent-muted"
                      : "border-border bg-bg-subtle hover:border-border-strong")
                  }
                >
                  <div
                    className={
                      "font-semibold mb-1 " + (active ? "text-accent" : "")
                    }
                  >
                    {m.title}
                  </div>
                  <p className="text-xs text-text-muted">{m.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn-primary text-sm min-h-[44px] px-5 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search archive"}
          </button>
          {searched && !loading && (
            <span className="text-xs text-text-muted font-mono">
              {results.length} match{results.length === 1 ? "" : "es"} · {mode}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-danger border border-danger/30 bg-danger-muted rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </form>

      <section className="card p-5">
        <h3 className="font-semibold tracking-tight mb-3">Try an example</h3>
        <ul className="space-y-2">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => setQuery(ex)}
                className="text-sm text-left text-text-muted hover:text-cyan font-mono w-full"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-3 min-w-0">
        {results.length === 0 && searched && !loading && !error && (
          <EmptyState
            title={`No matches for "${query.trim()}"`}
            description="Try hybrid mode, fewer words, or a different archive filter."
          />
        )}

        {results.length === 0 && !searched && (
          <EmptyState
            title="Ask in plain English"
            description="Describe the moment you're looking for — semantic search matches meaning across every searchable episode."
          />
        )}

        {results.map((r) => (
          <SearchResultCard key={r.id} result={r} query={query.trim()} />
        ))}
      </div>
    </div>
  );
}
