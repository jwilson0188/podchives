"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs the current route's server render (router.refresh) so
 * server-rendered, DB-backed pages update live without a manual reload.
 *
 * Cheap + safe: refresh only re-reads the database; it never calls OpenAI, so
 * it doesn't consume API credits. Polling pauses while the tab is hidden.
 */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
