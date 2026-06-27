"use client";

import Link from "next/link";
import type { BackfillEstimate } from "@/lib/data";
import { formatBackfillCostRange } from "@/lib/formatCost";
import { useLivePoll } from "@/hooks/useLivePoll";

const empty: BackfillEstimate = {
  remainingEpisodes: 0,
  remainingMinutes: 0,
  whisperCostUsd: 0,
  embeddingCostUsd: 0,
  totalCostUsd: 0,
  totalCostUsdLow: 0,
  totalCostUsdHigh: 0,
};

export function BackfillCostHint({
  initial,
  enabled = true,
}: {
  initial?: BackfillEstimate;
  enabled?: boolean;
}) {
  const { data: backfill } = useLivePoll(
    "/api/usage/backfill",
    initial ?? empty,
    30_000,
    enabled,
  );

  if (backfill.remainingEpisodes === 0) return null;

  return (
    <Link
      href="/usage"
      className="text-[11px] text-text-muted hover:text-accent border border-border rounded-md px-2.5 py-1.5 bg-bg-subtle transition-colors"
      title="Estimated OpenAI cost to finish processing your backlog"
    >
      <span className="text-warn font-medium">
        {formatBackfillCostRange(backfill)}
      </span>{" "}
      to finish · {backfill.remainingEpisodes.toLocaleString()} ep
    </Link>
  );
}
