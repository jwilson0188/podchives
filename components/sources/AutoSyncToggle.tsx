"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AutoSyncToggle({
  sourceId,
  initial,
}: {
  sourceId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    setEnabled(next); // optimistic
    try {
      const res = await fetch(`/api/sources/${sourceId}/auto-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert on failure
        console.error("Auto-sync toggle failed", await res.text());
      } else {
        router.refresh();
      }
    } catch (err) {
      setEnabled(!next);
      console.error("Auto-sync toggle failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Auto-sync"
      onClick={toggle}
      disabled={busy}
      title={
        enabled
          ? "Auto-sync on — worker re-syncs this source every ~6h"
          : "Auto-sync off — sync manually with “Sync now”"
      }
      className="flex items-center gap-1.5 text-[0.8125rem] text-text-muted disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          enabled ? "bg-accent" : "bg-bg-elevated border border-border"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      auto-sync
    </button>
  );
}
