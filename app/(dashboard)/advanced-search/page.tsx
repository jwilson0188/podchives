import { redirect } from "next/navigation";

/**
 * Advanced Search was a near-duplicate of /search: same filter panel, same
 * /api/search endpoint, same result shape. The only real differences were that
 * it defaulted to semantic mode and rendered its own mode picker — both of
 * which /search now covers via the filter panel's keyword/semantic/hybrid
 * toggle. Kept as a redirect so existing links and bookmarks keep working.
 */
export default function AdvancedSearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const query = qs.toString();
  redirect(query ? `/search?${query}` : "/search");
}
