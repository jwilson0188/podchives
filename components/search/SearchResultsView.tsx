"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ArchiveOption } from "@/components/search/FilterPanel";
import type { SearchResultView } from "@/lib/data";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { readSearchUrlParams } from "@/lib/searchFilters";

export function SearchResultsView({
  archives,
}: {
  archives: ArchiveOption[];
}) {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();

  // readSearchUrlParams builds a new object on every render. Used directly as
  // an effect dependency that meant: fetch -> setState -> re-render -> new
  // object -> fetch again, roughly eight requests a second for as long as the
  // page was open. Key the memo on the serialised params so identity only
  // changes when the query string actually does.
  const paramsKey = searchParams.toString();
  const url = useMemo(
    () => readSearchUrlParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsKey],
  );

  const archiveName = url.archiveId
    ? archives.find((a) => a.id === url.archiveId)?.name
    : undefined;

  // Saved search hits may reference a replaced transcript generation. Retrieve
  // current results instead of presenting session snapshots as current evidence.
  const [results, setResults] = useState<SearchResultView[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  useScrollRestore();

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setResults([]);
    setRefreshing(true);

    const qs = new URLSearchParams({ q: query });
    if (url.archiveId) qs.set("archive", url.archiveId);
    if (url.platform && url.platform !== "all") qs.set("platform", url.platform);
    if (url.dateRange && url.dateRange !== "all") qs.set("range", url.dateRange);
    if (url.mode && url.mode !== "keyword") qs.set("mode", url.mode);
    if (url.searchableOnly === false) qs.set("searchable", "0");

    fetch(`/api/search?${qs}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.results) return;
        setResults(data.results);
      })
      .catch(() => {
        // Prior transcript results were cleared before the request.
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, url]);

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
