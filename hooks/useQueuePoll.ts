"use client";
import { useEffect, useState } from "react";
import type { ProcessingJobBucket } from "@/lib/data";
import { startQueuePolling } from "@/lib/queuePolling";

export function useQueuePoll(initial: ProcessingJobBucket, enabled: boolean) {
  const [data, setData] = useState<ProcessingJobBucket | null>(initial.error ? null : initial);
  const [failed, setFailed] = useState(Boolean(initial.error));
  useEffect(() => {
    if (initial.error) setFailed(true);
    else { setData(initial); setFailed(false); }
    if (!enabled) return;
    return startQueuePolling<ProcessingJobBucket>({
      visible: () => document.visibilityState !== "hidden",
      read: async (signal) => {
        const response = await fetch("/api/processing-queue/live", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Queue unavailable");
        const next = await response.json();
        if (next.error || ![next.active, next.queued, next.failed, next.completed].every(Array.isArray)
          || !next.totals || ![next.totals.active, next.totals.queued, next.totals.failed].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Invalid queue response");
        return next;
      },
      success: (next) => { setData(next); setFailed(false); },
      failure: () => setFailed(true),
    });
  }, [initial, enabled]);
  return { data, failed };
}
