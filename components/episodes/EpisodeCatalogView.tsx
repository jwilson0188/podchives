"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ArchiveOption } from "@/components/search/FilterPanel";
import { EpisodeCatalogTable } from "@/components/episodes/EpisodeCatalogTable";
import { EpisodeFilterBar } from "@/components/episodes/EpisodeFilterBar";
import type { EpisodeView } from "@/lib/data";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import {
  episodeCatalogCacheKey,
  getCachedEpisodeCatalog,
  getStaleEpisodeCatalog,
  setCachedEpisodeCatalog,
} from "@/lib/episodeCatalogCache";

export function EpisodeCatalogView({
  initialEpisodes,
  archives,
}: {
  initialEpisodes: EpisodeView[];
  archives: ArchiveOption[];
}) {
  const searchParams = useSearchParams();
  const archive = searchParams.get("archive") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const cacheKey = useMemo(
    () => episodeCatalogCacheKey(archive, status),
    [archive, status],
  );

  const [episodes, setEpisodes] = useState<EpisodeView[]>(() => {
    const fresh = getCachedEpisodeCatalog(cacheKey);
    if (fresh) return fresh;
    const stale = getStaleEpisodeCatalog(cacheKey);
    if (stale) return stale;
    if (!archive && !status) return initialEpisodes;
    return initialEpisodes;
  });

  const [refreshing, setRefreshing] = useState(false);

  useScrollRestore();

  useEffect(() => {
    const fresh = getCachedEpisodeCatalog(cacheKey);
    if (fresh) {
      setEpisodes(fresh);
      return;
    }

    const stale = getStaleEpisodeCatalog(cacheKey);
    if (stale) {
      setEpisodes(stale);
    } else if (!archive && !status) {
      setEpisodes(initialEpisodes);
      setCachedEpisodeCatalog(cacheKey, initialEpisodes);
      return;
    }

    let cancelled = false;
    setRefreshing(true);

    const qs = new URLSearchParams();
    if (archive) qs.set("archive", archive);
    if (status) qs.set("status", status);

    fetch(`/api/episodes?${qs}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.episodes) return;
        setEpisodes(data.episodes);
        setCachedEpisodeCatalog(cacheKey, data.episodes);
      })
      .catch(() => {
        // keep showing stale / prior list
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, archive, status, initialEpisodes]);

  useEffect(() => {
    if (!archive && !status && !getStaleEpisodeCatalog(cacheKey)) {
      setCachedEpisodeCatalog(cacheKey, initialEpisodes);
    }
  }, [cacheKey, archive, status, initialEpisodes]);

  return (
    <>
      <EpisodeFilterBar archives={archives} />
      {refreshing && episodes.length > 0 && (
        <p className="text-[11px] text-text-muted mb-2 text-right">
          Updating…
        </p>
      )}
      <EpisodeCatalogTable episodes={episodes} statusFilter={status} />
    </>
  );
}
