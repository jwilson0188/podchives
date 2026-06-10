import Link from "next/link";
import { demoUsage } from "@/lib/demoData";

export function UsageCreditsCard() {
  const pct = Math.round(
    (demoUsage.creditsRemaining / demoUsage.creditsTotal) * 100,
  );
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold tracking-tight">Compute / Usage</h2>
        <Link
          href="/usage"
          className="text-xs text-accent hover:text-accent-hover"
        >
          Details →
        </Link>
      </div>
      <div className="text-xs text-text-muted mb-4">
        {demoUsage.monthLabel}
      </div>

      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-semibold tabular-nums">
            {demoUsage.creditsRemaining}
            <span className="text-sm text-text-muted font-normal">
              {" "}
              / {demoUsage.creditsTotal}
            </span>
          </div>
          <div className="text-[11px] uppercase tracking-widest text-text-muted">
            credits left
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Transcription</dt>
          <dd className="font-mono tabular-nums">
            {demoUsage.transcriptionMinutes} min · ${demoUsage.transcriptionCostUsd.toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Embeddings</dt>
          <dd className="font-mono tabular-nums">
            {(demoUsage.embeddingTokens / 1000).toFixed(1)}K tok · ${demoUsage.embeddingCostUsd.toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-text-muted">Storage</dt>
          <dd className="font-mono tabular-nums">
            {(demoUsage.storageBytes / 1_000_000_000).toFixed(2)} GB
          </dd>
        </div>
      </dl>
    </div>
  );
}
