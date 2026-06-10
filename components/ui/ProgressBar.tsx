import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  status,
  className,
}: {
  value: number;
  status?: "active" | "completed" | "failed" | "queued";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const tone =
    status === "failed"
      ? "bg-danger"
      : status === "completed"
        ? "bg-success"
        : status === "queued"
          ? "bg-bg-elevated"
          : "bg-accent";
  return (
    <div className={cn("h-1.5 rounded-full bg-bg-elevated overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all", tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
