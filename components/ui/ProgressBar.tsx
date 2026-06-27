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
  const isActive = status === "active";
  const tone =
    status === "failed"
      ? "bg-danger"
      : status === "completed"
        ? "bg-success"
        : status === "queued"
          ? "bg-bg-elevated"
          : "bg-accent";
  return (
    <div
      className={cn(
        "h-1.5 rounded-full bg-bg-elevated overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out relative overflow-hidden",
          tone,
          isActive && "animate-progress-glow",
        )}
        style={{ width: `${pct}%` }}
      >
        {isActive && (
          <div
            aria-hidden
            className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-progress-shimmer"
          />
        )}
      </div>
    </div>
  );
}
