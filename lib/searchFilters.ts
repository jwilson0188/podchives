import type { SearchFilters, SearchMode } from "./search";

export type SearchUrlParams = {
  archiveId?: string;
  platform?: string;
  dateRange?: string;
  mode?: SearchMode;
  searchableOnly?: boolean;
};

export function parseSearchMode(raw: string | null): SearchMode {
  if (raw === "semantic" || raw === "hybrid") return raw;
  return "keyword";
}

export function dateRangeToFrom(dateRange: string | undefined): string | undefined {
  if (!dateRange || dateRange === "all") return undefined;
  const days =
    dateRange === "7d"
      ? 7
      : dateRange === "30d"
        ? 30
        : dateRange === "90d"
          ? 90
          : dateRange === "1y"
            ? 365
            : 0;
  if (!days) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function filtersFromUrlParams(
  params: SearchUrlParams,
): SearchFilters {
  const platform =
    params.platform && params.platform !== "all" ? params.platform : undefined;
  return {
    archiveId: params.archiveId,
    sourcePlatform: platform,
    dateFrom: dateRangeToFrom(params.dateRange),
    searchableOnly: params.searchableOnly !== false,
    limit: 50,
  };
}

export function readSearchUrlParams(
  searchParams: URLSearchParams,
): SearchUrlParams {
  const archive = searchParams.get("archive");
  const platform = searchParams.get("platform") ?? "all";
  const dateRange = searchParams.get("range") ?? "all";
  const mode = parseSearchMode(searchParams.get("mode"));
  const searchableOnly = searchParams.get("searchable") !== "0";
  return {
    archiveId: archive && archive !== "all" ? archive : undefined,
    platform,
    dateRange,
    mode,
    searchableOnly,
  };
}

export function buildSearchQueryString(args: {
  q?: string;
  archiveId?: string;
  platform?: string;
  dateRange?: string;
  mode?: SearchMode;
  searchableOnly?: boolean;
}): string {
  const params = new URLSearchParams();
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.archiveId && args.archiveId !== "all") {
    params.set("archive", args.archiveId);
  }
  if (args.platform && args.platform !== "all") {
    params.set("platform", args.platform);
  }
  if (args.dateRange && args.dateRange !== "all") {
    params.set("range", args.dateRange);
  }
  if (args.mode && args.mode !== "keyword") params.set("mode", args.mode);
  if (args.searchableOnly === false) params.set("searchable", "0");
  return params.toString();
}

/** Dynamic WHERE fragments for raw SQL search queries. */
export function buildFilterSql(
  filters: SearchFilters,
  startIndex: number,
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;

  if (filters.archiveId) {
    i += 1;
    clauses.push(`AND ts.podcast_id = $${i}`);
    params.push(filters.archiveId);
  }
  if (filters.sourcePlatform) {
    i += 1;
    clauses.push(`AND ts.source_platform = $${i}`);
    params.push(filters.sourcePlatform);
  }
  if (filters.dateFrom) {
    i += 1;
    clauses.push(`AND e.publish_date >= $${i}::timestamptz`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    i += 1;
    clauses.push(`AND e.publish_date <= $${i}::timestamptz`);
    params.push(filters.dateTo);
  }
  if (filters.searchableOnly !== false) {
    clauses.push("AND e.is_searchable = true");
  }

  return { sql: clauses.join("\n      "), params };
}
