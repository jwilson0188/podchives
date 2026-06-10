import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/constants";

const STATUS_STYLES: Record<JobStatus | string, string> = {
  queued: "bg-bg-elevated text-text-muted border border-border",
  running: "bg-cyan-muted text-cyan",
  downloading: "bg-cyan-muted text-cyan",
  extracting_audio: "bg-cyan-muted text-cyan",
  transcribing: "bg-warn-muted text-warn",
  segmenting: "bg-warn-muted text-warn",
  embedding: "bg-warn-muted text-warn",
  indexing: "bg-warn-muted text-warn",
  completed: "bg-success-muted text-success",
  failed: "bg-danger-muted text-danger",
  idle: "bg-bg-elevated text-text-muted border border-border",
  syncing: "bg-cyan-muted text-cyan",
  error: "bg-danger-muted text-danger",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "queued",
  running: "running",
  downloading: "downloading",
  extracting_audio: "extracting audio",
  transcribing: "transcribing",
  segmenting: "segmenting",
  embedding: "embedding",
  indexing: "indexing",
  completed: "ready",
  failed: "failed",
  idle: "idle",
  syncing: "syncing",
  error: "error",
};

export function StatusBadge({
  status,
  pulse,
  className,
}: {
  status: JobStatus | string;
  pulse?: boolean;
  className?: string;
}) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.queued;
  const label = STATUS_LABELS[status] ?? status;
  const isActive =
    status !== "completed" && status !== "failed" && status !== "queued" && status !== "idle";
  const showPulse = pulse ?? isActive;

  return (
    <span className={cn("pill", cls, className)}>
      {showPulse && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full bg-current animate-pulse",
            status === "completed" && "bg-success",
            status === "failed" && "bg-danger",
          )}
        />
      )}
      {!showPulse && status === "completed" && (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m5 12 5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {!showPulse && status === "failed" && (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      )}
      {label}
    </span>
  );
}
