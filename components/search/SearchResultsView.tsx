"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ArchiveOption } from "@/components/search/FilterPanel";
import type { SearchResultView } from "@/lib/data";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { readSearchUrlParams } from "@/lib/searchFilters";
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
  const url = readSearchUrlParams(searchParams);

  const cacheKey = useMemo(
    () =>
      query
        ? searchCacheKey(query, {
            archive: url.archiveId,
            platform: url.platform,
            range: url.dateRange,
            mode: url.mode,
            searchableOnly: url.searchableOnly,
          })
        : "",
    [query, url],
  );

  const archiveName = url.archiveId
    ? archives.find((a) => a.id === url.archiveId)?.name
    : undefined;

  // Start empty to match SSR — sessionStorage doesn't exist on the server, so
  // seeding from cache here renders different markup on the client and trips
  // a hydration error. The effect below rehydrates from cache after mount.
  const [results, setResults] = useState<SearchResultView[]>([]);

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
    }

    let cancelled = false;
    setRefreshing(true);

    const qs = new URLSearchParams({ q: query });
    if (url.archiveId) qs.set("archive", url.archiveId);
    if (url.platform && url.platform !== "all") qs.set("platform", url.platform);
    if (url.dateRange && url.dateRange !== "all") qs.set("range", url.dateRange);
    if (url.mode && url.mode !== "keyword") qs.set("mode", url.mode);
    if (url.searchableOnly === false) qs.set("searchable", "0");

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
  }, [query, cacheKey, url]);

  const filterBits: string[] = [];
  if (archiveName) filterBits.push(archiveName);
  if (url.platform && url.platform !== "all") filterBits.push(url.platform);
  if (url.dateRange && url.dateRange !== "all") filterBits.push(url.dateRange);
  if (url.mode && url.mode !== "keyword") filterBits.push(url.mode);

  return (
    <div className="space-y-3 min-w-0">
      {query && (
        <div className="text-[0.8125rem] text-ink-secondary">
          <span className="tabular font-medium text-ink">{results.length}</span>{" "}
          {results.length === 1 ? "match" : "matches"} for{" "}
          <span className="text-ink">&ldquo;{query}&rdquo;</span>
          {filterBits.length > 0 && (
            <span className="text-ink-muted"> · {filterBits.join(" · ")}</span>
          )}
          {refreshing && results.length > 0 && (
            <span className="text-ink-muted"> · updating…</span>
          )}
        </div>
      )}

      {results.length === 0 && query && !refreshing && (
        <EmptyState
          title={`No matches for "${query}"`}
          description="Try hybrid mode, a broader date range, or remove filters."
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
