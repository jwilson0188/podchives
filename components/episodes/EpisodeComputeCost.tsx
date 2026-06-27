"use client";

import { Collapsible } from "@/components/ui/Collapsible";
import type { EpisodeUsage } from "@/lib/data";
import { formatDuration } from "@/lib/utils";

export function EpisodeComputeCost({ usage }: { usage: EpisodeUsage }) {
  return (
    <Collapsible
      variant="card"
      defaultOpen={false}
      className="mt-6"
      title={
        <span className="text-sm font-semibold tracking-tight">
          Compute &amp; cost
        </span>
      }
      summary={`$${usage.totalCostUsd.toFixed(3)} total`}
      contentClassName="pt-1"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <UsageStat
          label="Transcription"
          value={
            usage.isTranscribed
              ? `$${usage.transcriptionCostUsd.toFixed(3)}`
              : "—"
          }
          sub={`${Math.round(usage.durationSeconds / 60)} min`}
        />
        <UsageStat
          label="Embeddings"
          value={`$${usage.embeddingCostUsd.toFixed(4)}`}
          sub={`${usage.embeddingTokens.toLocaleString()} tok`}
        />
        <UsageStat
          label="Audio"
          value={
            usage.audioBytes > 0
              ? `${(usage.audioBytes / 1_000_000).toFixed(1)} MB`
              : "—"
          }
          sub="downloaded"
        />
        <UsageStat
          label="Duration"
          value={formatDuration(usage.durationSeconds)}
          sub="source length"
        />
      </div>
    </Collapsible>
  );
}

function UsageStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-bg-subtle rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-widest text-text-muted">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] text-text-muted font-mono">{sub}</div>
    </div>
  );
}
