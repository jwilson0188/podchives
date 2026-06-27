import type { SearchResultView } from "@/lib/data";
import { readSessionJson, writeSessionJson } from "@/lib/sessionStore";

type CacheEntry = {
  results: SearchResultView[];
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();

export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

export function searchCacheKey(q: string, archive?: string): string {
  return `${q}|${archive ?? ""}`;
}

function sessionKey(key: string): string {
  return `search:${key}`;
}

export function getCachedSearch(key: string): SearchResultView[] | null {
  const mem = memory.get(key);
  if (mem && Date.now() - mem.fetchedAt <= SEARCH_CACHE_TTL_MS) {
    return mem.results;
  }

  const stored = readSessionJson<CacheEntry>(sessionKey(key));
  if (stored && Date.now() - stored.fetchedAt <= SEARCH_CACHE_TTL_MS) {
    memory.set(key, stored);
    return stored.results;
  }

  return memory.get(key)?.results ?? stored?.results ?? null;
}

export function setCachedSearch(
  key: string,
  results: SearchResultView[],
): void {
  const entry = { results, fetchedAt: Date.now() };
  memory.set(key, entry);
  writeSessionJson(sessionKey(key), entry);
}
