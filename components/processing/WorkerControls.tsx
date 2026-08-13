"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type WorkerStatus = {
  enabled: boolean;
  queuedCount: number;
  activeCount: number;
  lastRunAt: string | null;
  demo: boolean;
};

export function WorkerControls({
  initialStatus,
}: {
  initialStatus: WorkerStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async () => {
    if (busy) return;
    const nextEnabled = !status.enabled;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/worker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to update worker");
      }
      setStatus({
        enabled: json.enabled ?? nextEnabled,
        queuedCount: json.queuedCount ?? status.queuedCount,
        activeCount: json.activeCount ?? status.activeCount,
        lastRunAt: json.lastRunAt ?? status.lastRunAt,
        demo: json.demo ?? status.demo,
      });
      setMessage(json.message ?? null);
      router.refresh();
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to update worker");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {status.enabled ? (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="btn-secondary text-sm"
          >
            {busy ? "Stopping…" : "Stop worker"}
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="btn-primary text-sm"
          >
            {busy ? "Starting…" : "Start worker"}
          </button>
        )}
      </div>
      {message && (
        <p className="text-[0.8125rem] text-text-muted max-w-xs text-right">
          {message}
        </p>
      )}
      {!status.enabled && status.queuedCount > 0 && !message && (
        <p className="text-[0.8125rem] text-text-muted max-w-xs text-right">
          {status.queuedCount} job{status.queuedCount === 1 ? "" : "s"} waiting
          in queue.
        </p>
      )}
    </div>
  );
}
