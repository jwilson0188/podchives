"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncNowButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${sourceId}/sync`, {
        method: "POST",
      });
      // Don't block on the response body — errors get logged server-side.
      // We just want the page to refresh so the new "queued" status shows.
      if (!res.ok) {
        console.error("Sync request failed", await res.text());
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn-secondary text-xs"
    >
      {busy ? "Syncing…" : "Sync now"}
    </button>
  );
}
