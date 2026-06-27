"use client";

import { StatCard } from "@/components/ui/StatCard";
import { COST_MODEL } from "@/lib/constants";
import type { UsageStats } from "@/lib/data";
import { useLivePoll } from "@/hooks/useLivePoll";

export function UsageLiveBody({
  initial,
  isDemo,
}: {
  initial: UsageStats;
  isDemo: boolean;
}) {
  const { data: usage, live } = useLivePoll(
    "/api/usage",
    initial,
    15_000,
    !isDemo,
  );

  const pct =
    usage.creditsTotal > 0
      ? Math.round((usage.creditsRemaining / usage.creditsTotal) * 100)
      : 0;
  const totalCostUsd = usage.transcriptionCostUsd + usage.embeddingCostUsd;

  return (
    <>
      <section className="card p-5 mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold tracking-tight flex items-center gap-2">
            Compute budget
            {!isDemo && (
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  live ? "bg-success animate-pulse" : "bg-text-dim"
                }`}
                title={live ? "Live" : "Loading…"}
              />
            )}
          </h2>
          <span className="text-xs text-text-muted font-mono">
            {isDemo
              ? "placeholder · demo data"
              : `worker minutes · ${usage.monthLabel}`}
          </span>
        </div>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-4xl font-semibold tabular-nums">
            {usage.creditsRemaining}
          </span>
          <span className="text-text-muted">
            of {usage.creditsTotal} min remaining ({pct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Transcription"
          value={`${usage.transcriptionMinutes.toLocaleString()} min`}
          hint={`$${usage.transcriptionCostUsd.toFixed(2)} · audio transcribed`}
          accent="cyan"
        />
        <StatCard
          label="Embeddings"
          value={`${(usage.embeddingTokens / 1000).toFixed(1)}K tok`}
          hint={`$${usage.embeddingCostUsd.toFixed(2)} · tokens billed`}
          accent="cyan"
        />
        <StatCard
          label="Storage"
          value={`${(usage.storageBytes / 1_000_000_000).toFixed(2)} GB`}
          hint="audio downloaded + transcripts (measured)"
        />
        <StatCard
          label="Compute"
          value={`${usage.computeMinutes.toLocaleString()} min`}
          hint={`worker time · ${usage.monthLabel}`}
        />
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold tracking-tight">Cost model</h2>
          <span className="text-xs text-text-muted font-mono">
            ${totalCostUsd.toFixed(2)} total
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-text-muted">
            <tr>
              <th className="text-left font-medium pb-2">Stage</th>
              <th className="text-left font-medium pb-2">Provider</th>
              <th className="text-left font-medium pb-2">Unit</th>
              <th className="text-right font-medium pb-2">Estimate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <CostRow
              stage="Transcription"
              provider="OpenAI Whisper API"
              unit={`$${COST_MODEL.whisperUsdPerMinute.toFixed(3)} / minute`}
              est={`$${usage.transcriptionCostUsd.toFixed(2)}`}
            />
            <CostRow
              stage="Embeddings"
              provider="OpenAI text-embedding-3-small"
              unit={`$${COST_MODEL.embeddingUsdPer1MTokens.toFixed(3)} / 1M tokens`}
              est={`$${usage.embeddingCostUsd.toFixed(2)}`}
            />
            <CostRow
              stage="Storage"
              provider="Worker disk (ephemeral) + Postgres"
              unit="measured"
              est={`${(usage.storageBytes / 1_000_000_000).toFixed(2)} GB`}
            />
            <CostRow
              stage="Compute"
              provider="Render worker"
              unit="wall-clock"
              est={`${usage.computeMinutes.toLocaleString()} min`}
            />
          </tbody>
        </table>
        <p className="mt-4 text-[11px] text-text-muted">
          Measured from real usage: transcription minutes (Whisper bills per
          audio-minute), embedding tokens (from OpenAI&apos;s reported usage),
          downloaded audio bytes, and worker wall-clock time. Dollar figures
          apply OpenAI&apos;s list prices to those real quantities. Episodes
          processed before metering was added may read low until reprocessed.
        </p>
      </section>
    </>
  );
}

function CostRow({
  stage,
  provider,
  unit,
  est,
}: {
  stage: string;
  provider: string;
  unit: string;
  est: string;
}) {
  return (
    <tr>
      <td className="py-3 font-medium">{stage}</td>
      <td className="py-3 text-text-muted">{provider}</td>
      <td className="py-3 text-text-muted font-mono">{unit}</td>
      <td className="py-3 text-right font-mono tabular-nums">{est}</td>
    </tr>
  );
}
