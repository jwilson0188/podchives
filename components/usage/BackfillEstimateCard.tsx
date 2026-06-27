import { COST_MODEL } from "@/lib/constants";
import type { BackfillEstimate } from "@/lib/data";
import { getTranscriptionCostPerMinute } from "@/lib/transcriptionConfig";
import { formatBackfillCostRange, formatUsd } from "@/lib/formatCost";

export function BackfillEstimateCard({
  backfill,
  live,
  isDemo,
}: {
  backfill: BackfillEstimate;
  live?: boolean;
  isDemo?: boolean;
}) {
  if (backfill.remainingEpisodes === 0) {
    return (
      <section className="card p-5 mb-6 border-success/30 bg-success/5">
        <h2 className="font-semibold tracking-tight text-success">
          Backfill complete
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Every ingested episode is searchable. New uploads will accrue cost as
          they process.
        </p>
      </section>
    );
  }

  const costRange = formatBackfillCostRange(backfill);

  return (
    <section className="card p-5 mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          Backfill estimate
          {live && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse"
              title="Live"
            />
          )}
        </h2>
        <span className="text-xs text-text-muted font-mono">
          {isDemo ? "demo data" : "before you flip auto-sync"}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{costRange}</div>
          <p className="text-sm text-text-muted mt-1">
            est. OpenAI cost to finish{" "}
            <span className="text-text-primary font-medium">
              {backfill.remainingEpisodes.toLocaleString()} episode
              {backfill.remainingEpisodes === 1 ? "" : "s"}
            </span>{" "}
            ({backfill.remainingMinutes.toLocaleString()} min of audio)
          </p>
        </div>
        <div className="text-right text-sm font-mono tabular-nums text-text-muted">
          <div>
            Transcription · {formatUsd(backfill.whisperCostUsd)}
          </div>
          <div>
            Embeddings · {formatUsd(backfill.embeddingCostUsd)}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        Based on episode duration in your archive. YouTube sources use free
        auto-captions first; Groq Whisper API fallback is $
        {getTranscriptionCostPerMinute().toFixed(4)}/min. Embeddings: $
        {COST_MODEL.embeddingUsdPer1MTokens.toFixed(2)}/1M tokens. Range ±
        {Math.round(COST_MODEL.backfillCostVariance * 100)}%. Does not include
        Render hosting (~$7/mo).
      </p>
    </section>
  );
}
