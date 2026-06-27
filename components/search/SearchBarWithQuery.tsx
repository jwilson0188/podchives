"use client";

import { useSearchParams } from "next/navigation";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";

/** Reads ?q= client-side so the search page shell stays cacheable on back nav. */
export function SearchBarWithQuery() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const archiveParam = searchParams.get("archive");
  const archiveId =
    archiveParam && archiveParam !== "all" ? archiveParam : undefined;

  return (
    <GlobalSearchBar
      size="lg"
      autoFocus={!query}
      defaultValue={query}
      archiveId={archiveId}
      placeholder="e.g. 'boring infrastructure'  ·  'open source AI'  ·  exact phrase"
    />
  );
}
