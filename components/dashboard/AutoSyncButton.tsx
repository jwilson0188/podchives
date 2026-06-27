"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Global auto-sync master switch for the dashboard. Flips auto-sync for every
 * source at once. Per-source control still lives on the Sources page.
 */
export function AutoSyncButton({
  total,
  enabled: enabledInitial,
}: {
  total: number;
  enabled: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(enabledInitial);
  const [busy, setBusy] = useState(false);

  const allOn = total > 0 && enabled === total;
  const partial = enabled > 0 && enabled < total;
  const noSources = total === 0;

  const label = noSources
    ? "No sources"
    : allOn
      ? "Auto-sync on"
      : partial
        ? `Auto-sync ${enabled}/${total}`
        : "Auto-sync off";

  const toggle = async () => {
    if (busy || noSources) return;
    const next = !allOn; // partial or off → turn all on; on → turn all off
    setBusy(true);
    setEnabled(next ? total : 0); // optimistic
    try {
      const res = await fetch("/api/sources/auto-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setEnabled(enabledInitial); // revert
        console.error("Auto-sync update failed", await res.text());
      } else {
        router.refresh();
      }
    } catch (err) {
      setEnabled(enabledInitial);
      console.error("Auto-sync update failed", err);
    } finally {
      setBusy(false);
    }
  };

  const active = enabled > 0;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={allOn}
      onClick={toggle}
      disabled={busy || noSources}
      title={
        noSources
          ? "Add a source first"
          : allOn
            ? "Auto-sync is on for all sources — click to turn off"
            : "Click to auto-sync all sources (re-syncs every ~6h)"
      }
      className="btn-secondary text-xs flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          active ? "bg-accent" : "bg-bg-elevated border border-border"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            active ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
