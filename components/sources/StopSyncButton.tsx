"use client";

import { useState } from "react";

export function StopSyncButton({
  sourceId,
  syncStatus,
  autoSync,
  onStopped,
}: {
  sourceId: string;
  syncStatus: string;
  autoSync: boolean;
  onStopped?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);

  const isActive =
    autoSync || syncStatus === "syncing" || syncStatus === "queued";

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${sourceId}/stop-sync`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("Stop sync failed", await res.text());
        return;
      }
      setStopped(true);
      onStopped?.();
    } finally {
      setBusy(false);
    }
  };

  if (stopped) {
    return (
      <button type="button" disabled className="btn-ghost text-xs text-text-muted">
        Sync stopped
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !isActive}
      title={
        isActive
          ? "Turn off auto-sync and cancel queued jobs for this source"
          : "Nothing syncing for this source"
      }
      className="btn-ghost text-xs text-warn hover:bg-warn-muted disabled:opacity-40"
    >
      {busy ? "Stopping…" : "Stop sync"}
    </button>
  );
}
