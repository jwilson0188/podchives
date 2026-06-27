"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveSourceButton({
  sourceId,
  sourceName,
}: {
  sourceId: string;
  sourceName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    const ok = window.confirm(
      `Remove "${sourceName}"?\n\nThis deletes the source and all its episodes, transcripts, and search index entries. This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Remove source failed", await res.text());
        window.alert("Failed to remove source. Check the logs and try again.");
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("Remove source failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Remove source"
      title="Remove source"
      className="text-text-muted hover:text-danger transition-colors disabled:opacity-50 p-1 -m-1"
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path
          d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 11v6M14 11v6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
