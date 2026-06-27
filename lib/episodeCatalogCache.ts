import type { EpisodeView } from "@/lib/data";
import { readSessionJson, writeSessionJson } from "@/lib/sessionStore";

type CacheEntry = {
  episodes: EpisodeView[];
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

export const EPISODE_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

export function episodeCatalogCacheKey(
  archive?: string,
  status?: string,
): string {
  return `${archive ?? ""}|${status ?? "all"}`;
}

function sessionKey(key: string): string {
  return `episodes:${key}`;
}

export function getCachedEpisodeCatalog(
  key: string,
): EpisodeView[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt <= EPISODE_CATALOG_CACHE_TTL_MS) {
    return entry.episodes;
  }

  const stored = readSessionJson<CacheEntry>(sessionKey(key));
  if (stored && Date.now() - stored.fetchedAt <= EPISODE_CATALOG_CACHE_TTL_MS) {
    cache.set(key, stored);
    return stored.episodes;
  }

  if (entry) return entry.episodes;
  return stored?.episodes ?? null;
}

/** Returns cached episodes even if TTL expired — for instant back navigation. */
export function getStaleEpisodeCatalog(key: string): EpisodeView[] | null {
  return cache.get(key)?.episodes ?? readSessionJson<CacheEntry>(sessionKey(key))?.episodes ?? null;
}

export function setCachedEpisodeCatalog(
  key: string,
  episodes: EpisodeView[],
): void {
  const entry = { episodes, fetchedAt: Date.now() };
  cache.set(key, entry);
  writeSessionJson(sessionKey(key), entry);
}
