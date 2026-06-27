"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SourceCard } from "@/components/sources/SourceCard";
import type { SourceView } from "@/lib/data";

export function SourcesList({
  initial,
  showStopSync,
  emptyTitle = "No sources connected",
  emptyDescription = "Paste a YouTube channel, playlist, or video URL above to start your first archive.",
}: {
  initial: SourceView[];
  showStopSync?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [sources, setSources] = useState(initial);

  useEffect(() => {
    setSources(initial);
  }, [initial]);

  useEffect(() => {
    if (initial.length > 0) return;

    let cancelled = false;
    fetch("/api/sources", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.sources?.length) return;
        setSources(json.sources);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initial.length]);

  if (sources.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <>
      {sources.map((s) => (
        <SourceCard
          key={s.id}
          source={s}
          showStopSync={showStopSync}
        />
      ))}
    </>
  );
}
