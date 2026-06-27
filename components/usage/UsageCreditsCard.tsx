"use client";

import Link from "next/link";
import type { UsageStats } from "@/lib/data";
import { useLivePoll } from "@/hooks/useLivePoll";

export function UsageCreditsCard({ initial }: { initial: UsageStats }) {
  const { data: usage, live } = useLivePoll("/api/usage", initial);

  const pct =
    usage.creditsTotal > 0
      ? Math.round((usage.creditsRemaining / usage.creditsTotal) * 100)
      : 0;

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          Compute / Usage
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              live ? "bg-success animate-pulse" : "bg-text-dim"
            }`}
            title={live ? "Live" : "Loading…"}
          />
        </h2>
        <Link
          href="/usage"
          className="text-xs text-accent hover:text-accent-hover"
        >
          Details →
        </Link>
      </div>
      <div className="text-xs text-text-muted mb-4">{usage.monthLabel}</div>

      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-semibold tabular-nums">
            {usage.creditsRemaining}
            <span className="text-sm text-text-muted font-normal">
              {" "}
              / {usage.creditsTotal}
            </span>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-text-muted">
            credits left
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Transcription</dt>
          <dd className="font-mono tabular-nums">
            {usage.transcriptionMinutes} min · $
            {usage.transcriptionCostUsd.toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Embeddings</dt>
          <dd className="font-mono tabular-nums">
            {(usage.embeddingTokens / 1000).toFixed(1)}K tok · $
            {usage.embeddingCostUsd.toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Storage</dt>
          <dd className="font-mono tabular-nums">
            {(usage.storageBytes / 1_000_000_000).toFixed(2)} GB
          </dd>
        </div>
      </dl>
    </div>
  );
}
