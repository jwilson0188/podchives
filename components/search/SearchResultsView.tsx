"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ArchiveOption } from "@/components/search/FilterPanel";
import type { SearchResultView } from "@/lib/data";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import {
  getCachedSearch,
  searchCacheKey,
  setCachedSearch,
} from "@/lib/searchCache";

export function SearchResultsView({
  archives,
}: {
  archives: ArchiveOption[];
}) {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const archiveId = searchParams.get("archive") ?? undefined;

  const cacheKey = useMemo(
    () => (query ? searchCacheKey(query, archiveId) : ""),
    [query, archiveId],
  );

  const archiveName = archiveId
    ? archives.find((a) => a.id === archiveId)?.name
    : undefined;

  const [results, setResults] = useState<SearchResultView[]>(() => {
    if (!query || !cacheKey) return [];
    return getCachedSearch(cacheKey) ?? [];
  });

  const [refreshing, setRefreshing] = useState(false);

  useScrollRestore();

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const cached = getCachedSearch(cacheKey);
    if (cached) {
      setResults(cached);
      return;
    }

    let cancelled = false;
    setRefreshing(true);

    const qs = new URLSearchParams({ q: query });
    if (archiveId) qs.set("archive", archiveId);

    fetch(`/api/search?${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.results) return;
        setResults(data.results);
        setCachedSearch(cacheKey, data.results);
      })
      .catch(() => {
        // keep prior results
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, archiveId, cacheKey]);

  return (
    <div className="space-y-3 min-w-0">
      {query && (
        <div className="text-xs text-text-muted font-mono">
          <span className="text-text-dim">query →</span>{" "}
          <span className="text-text-primary">&ldquo;{query}&rdquo;</span>{" "}
          <span className="text-text-dim">·</span> {results.length} match
          {results.length === 1 ? "" : "es"}
          {archiveName && (
            <>
              {" "}
              <span className="text-text-dim">in</span>{" "}
              <span className="text-cyan">{archiveName}</span>
            </>
          )}
          {refreshing && results.length > 0 && (
            <span className="text-text-dim ml-2">· updating…</span>
          )}
        </div>
      )}

      {results.length === 0 && query && !refreshing && (
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
  );
}
