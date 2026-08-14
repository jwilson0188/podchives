import { cn } from "@/lib/utils";

/**
 * Relevance of a search hit, relative to the strongest hit in the same result
 * set (see withRelativeRelevance in lib/search.ts).
 *
 * Deliberately not colour-coded by severity: a weaker match is still a valid
 * result, and the previous thresholds painted anything under 60% in the danger
 * tone — which meant a top keyword hit, scoring a raw ts_rank of ~0.09, showed
 * up as a red "9%".
 */
export function ConfidenceBadge({
  score,
  label,
  className,
}: {
  score: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);

  return (
    <span
      className={cn(
        "pill tabular bg-sunken text-ink-secondary border border-line",
        className,
      )}
      title={`${pct}% as relevant as the top result`}
    >
      {label ?? "score"} {pct}%
    </span>
  );
}
