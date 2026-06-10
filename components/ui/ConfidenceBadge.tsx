import { cn } from "@/lib/utils";

export function ConfidenceBadge({
  score,
  label,
  className,
}: {
  score: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.round(score * 100);
  const tone =
    pct >= 90
      ? "bg-success-muted text-success"
      : pct >= 75
        ? "bg-cyan-muted text-cyan"
        : pct >= 60
          ? "bg-warn-muted text-warn"
          : "bg-danger-muted text-danger";

  return (
    <span className={cn("pill font-mono tabular-nums", tone, className)}>
      {label ?? "score"}: {pct}%
    </span>
  );
}
