"use client";
import { useEffect, useState } from "react";
import type { DownloadManagerSnapshot } from "@/lib/data";
import { startQueuePolling } from "@/lib/queuePolling";

export function useDownloadPoll(initial: DownloadManagerSnapshot) {
  const [data, setData] = useState<DownloadManagerSnapshot | null>(initial.error ? null : initial);
  const [failed, setFailed] = useState(Boolean(initial.error));
  useEffect(() => {
    if (initial.error) setFailed(true);
    else { setData(initial); setFailed(false); }
    if (initial.demo) return;
    return startQueuePolling<DownloadManagerSnapshot>({
      visible: () => document.visibilityState !== "hidden",
      read: async (signal) => {
        const response = await fetch("/api/download-manager/live", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Download Manager unavailable");
        const next = await response.json();
        if (!next || next.error || typeof next.demo !== "boolean" || ![next.downloads, next.episodes, next.sources].every(Array.isArray)) throw new Error("Invalid manager response");
        return next;
      },
      success: (next) => { setData(next); setFailed(false); },
      failure: () => setFailed(true),
    });
  }, [initial]);
  return { data, failed };
}
