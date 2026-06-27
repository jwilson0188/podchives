import type { BackfillEstimate } from "@/lib/data";

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatBackfillCostRange(b: BackfillEstimate): string {
  if (b.totalCostUsd <= 0) return "$0";
  if (b.remainingEpisodes === 0) return "$0";
  const low = Math.max(0, b.totalCostUsdLow);
  const high = b.totalCostUsdHigh;
  if (Math.round(low) === Math.round(high)) {
    return formatUsd(b.totalCostUsd);
  }
  return `$${Math.round(low)}–$${Math.round(high)}`;
}
