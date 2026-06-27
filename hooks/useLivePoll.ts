"use client";

import { useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 15_000;

/**
 * Poll a JSON API on an interval. Pauses while the tab is hidden.
 * Keeps the last good value on transient failures or rejected updates.
 */
export function useLivePoll<T>(
  url: string,
  initial: T,
  intervalMs = DEFAULT_INTERVAL_MS,
  enabled = true,
  acceptUpdate?: (prev: T, next: T) => boolean,
): { data: T; live: boolean } {
  const [data, setData] = useState(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as T;
        if (cancelled) return;
        setData((prev) => {
          if (acceptUpdate && !acceptUpdate(prev, next)) return prev;
          return next;
        });
        setLive(true);
      } catch {
        // keep last good value
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs, enabled, acceptUpdate]);

  return { data, live };
}
