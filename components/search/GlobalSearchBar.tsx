"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { buildSearchQueryString } from "@/lib/searchFilters";

export function GlobalSearchBar({
  size = "md",
  defaultValue = "",
  autoFocus = false,
  placeholder = "Search every transcript, every moment, every show…",
  archiveId,
}: {
  size?: "md" | "lg";
  defaultValue?: string;
  autoFocus?: boolean;
  placeholder?: string;
  archiveId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(defaultValue);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;

    const qs = buildSearchQueryString({
      q: query,
      archiveId: archiveId ?? searchParams.get("archive") ?? undefined,
      platform: searchParams.get("platform") ?? undefined,
      dateRange: searchParams.get("range") ?? undefined,
      mode:
        searchParams.get("mode") === "semantic" ||
        searchParams.get("mode") === "hybrid"
          ? (searchParams.get("mode") as "semantic" | "hybrid")
          : undefined,
      searchableOnly: searchParams.get("searchable") !== "0",
    });
    router.push(`/search?${qs}`);
  };

  const isLg = size === "lg";

  return (
    <form
      onSubmit={onSubmit}
      className={isLg ? "relative w-full" : "relative w-full max-w-xl"}
    >
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
        <svg
          className={isLg ? "w-5 h-5" : "w-4 h-4"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={
          "input " +
          (isLg
            ? "pl-11 pr-28 py-3.5 text-base font-medium"
            : "pl-9 pr-20 py-2 text-sm")
        }
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        <kbd className="hidden md:inline-flex h-6 px-1.5 text-[10px] tracking-wider text-text-muted border border-border rounded bg-bg-elevated items-center font-mono">
          ENTER
        </kbd>
      </div>
    </form>
  );
}
