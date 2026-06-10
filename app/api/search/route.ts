import { NextResponse } from "next/server";
import { runSearch } from "@/lib/data";
import { saveSearchQuery, type SearchFilters } from "@/lib/search";

/**
 * Keyword search endpoint. Returns the same shape in demo and real mode.
 * On DB errors, falls back to an empty result list (logged server-side)
 * rather than 500-ing — the search UI shouldn't be down because Postgres is.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const archiveId = url.searchParams.get("archive") ?? undefined;
  const sourcePlatform = url.searchParams.get("platform") ?? undefined;
  const limit = Math.min(
    100,
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
  );

  const filters: SearchFilters = {
    archiveId,
    sourcePlatform,
    limit,
    searchableOnly: true,
  };

  const results = await runSearch(q, filters);

  // Fire-and-forget analytics. Failures don't break the search.
  saveSearchQuery({
    query: q,
    filters,
    resultCount: results.length,
  }).catch(() => {});

  return NextResponse.json({
    query: q,
    results,
    count: results.length,
  });
}
