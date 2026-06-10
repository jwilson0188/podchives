import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { demoUsage } from "@/lib/demoData";

export const metadata = { title: "Usage / Compute" };

export default function UsagePage() {
  const pct = Math.round(
    (demoUsage.creditsRemaining / demoUsage.creditsTotal) * 100,
  );
  return (
    <div>
      <PageHeader
        eyebrow="ops // usage"
        title="Usage / Compute"
        description={`Compute, transcription, embeddings, and storage usage for ${demoUsage.monthLabel}.`}
      />

      <section className="card p-5 mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold tracking-tight">Credits</h2>
          <span className="text-xs text-text-muted font-mono">
            placeholder · billing not connected
          </span>
        </div>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-4xl font-semibold tabular-nums">
            {demoUsage.creditsRemaining}
          </span>
          <span className="text-text-muted">
            of {demoUsage.creditsTotal} remaining ({pct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Transcription"
          value={`${demoUsage.transcriptionMinutes} min`}
          hint={`$${demoUsage.transcriptionCostUsd.toFixed(2)} estimated`}
          accent="cyan"
        />
        <StatCard
          label="Embeddings"
          value={`${(demoUsage.embeddingTokens / 1000).toFixed(1)}K tok`}
          hint={`$${demoUsage.embeddingCostUsd.toFixed(2)} estimated`}
          accent="cyan"
        />
        <StatCard
          label="Storage"
          value={`${(demoUsage.storageBytes / 1_000_000_000).toFixed(2)} GB`}
          hint="audio + transcripts + thumbnails"
        />
        <StatCard
          label="Compute"
          value={`${demoUsage.computeMinutes} min`}
          hint="local worker time"
        />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold tracking-tight mb-3">Cost model</h2>
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
              unit="$0.006 / minute"
              est={`$${demoUsage.transcriptionCostUsd.toFixed(2)}`}
            />
            <CostRow
              stage="Embeddings"
              provider="OpenAI text-embedding-3-small"
              unit="$0.020 / 1M tokens"
              est={`$${demoUsage.embeddingCostUsd.toFixed(2)}`}
            />
            <CostRow
              stage="Storage"
              provider="Local / Supabase / S3"
              unit="varies"
              est="—"
            />
            <CostRow
              stage="Search compute"
              provider="Self-hosted / Supabase"
              unit="negligible"
              est="—"
            />
          </tbody>
        </table>
        <p className="mt-4 text-[11px] text-text-muted">
          Numbers are estimates and assume default models. For local Whisper or
          local embeddings, costs go to zero except for compute time.
        </p>
      </section>
    </div>
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
