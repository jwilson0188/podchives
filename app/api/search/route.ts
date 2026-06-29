import { NextResponse } from "next/server";
import { runSearch } from "@/lib/data";
import {
  saveSearchQuery,
  type SearchFilters,
  type SearchMode,
} from "@/lib/search";
import {
  dateRangeToFrom,
  filtersFromUrlParams,
  parseSearchMode,
} from "@/lib/searchFilters";

/**
 * Search endpoint — keyword, semantic, or hybrid over transcript segments.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const mode: SearchMode = parseSearchMode(url.searchParams.get("mode"));
  const limit = Math.min(
    100,
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
  );

  const archiveId = url.searchParams.get("archive") ?? undefined;
  const platform = url.searchParams.get("platform") ?? undefined;
  const dateRange = url.searchParams.get("range") ?? undefined;
  const searchableOnly = url.searchParams.get("searchable") !== "0";

  const filters: SearchFilters = filtersFromUrlParams({
    archiveId: archiveId && archiveId !== "all" ? archiveId : undefined,
    platform: platform ?? "all",
    dateRange: dateRange ?? "all",
    searchableOnly,
  });
  filters.limit = limit;

  const results = await runSearch(q, filters, mode);

  saveSearchQuery({
    query: q,
    filters: { ...filters, mode } as SearchFilters & { mode?: SearchMode },
    resultCount: results.length,
  }).catch(() => {});

  return NextResponse.json({
    query: q,
    mode,
    filters: {
      archiveId: filters.archiveId,
      platform: platform ?? "all",
      range: dateRange ?? "all",
      searchableOnly,
      dateFrom: dateRangeToFrom(dateRange),
    },
    results,
    count: results.length,
  });
}
