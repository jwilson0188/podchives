"use client";

import { Collapsible, collapsePreview } from "@/components/ui/Collapsible";
import { cn } from "@/lib/utils";

const COLLAPSE_THRESHOLD = 80;

export function ErrorMessage({
  children,
  className,
  compact,
  defaultOpen = false,
  collapsible = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Inline variant for tables and dense rows. */
  compact?: boolean;
  defaultOpen?: boolean;
  /** When false, always show the full message. */
  collapsible?: boolean;
}) {
  const text = typeof children === "string" ? children : String(children ?? "");
  const shouldCollapse = collapsible && text.length > COLLAPSE_THRESHOLD;

  if (!shouldCollapse) {
    if (compact) {
      return (
        <p
          className={cn(
            "text-[11px] text-danger font-mono mt-1 min-w-0 break-words [overflow-wrap:anywhere]",
            className,
          )}
        >
          {text}
        </p>
      );
    }

    return (
      <div
        className={cn(
          "px-3 py-2 rounded-md bg-danger-muted border border-danger/30 text-xs font-mono text-danger flex items-start gap-2 min-w-0 max-w-full",
          className,
        )}
        role="alert"
      >
        <ErrorIcon />
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] leading-relaxed">
          {text}
        </span>
      </div>
    );
  }

  return (
    <Collapsible
      variant="danger"
      defaultOpen={defaultOpen}
      className={className}
      title={
        <span className="text-xs font-mono text-danger flex items-center gap-1.5 min-w-0">
          <ErrorIcon className="mt-0" />
          <span>Error details</span>
        </span>
      }
      summary={collapsePreview(text, compact ? 80 : 120)}
      contentClassName="text-xs font-mono text-danger break-words [overflow-wrap:anywhere] leading-relaxed whitespace-pre-wrap"
    >
      {text}
    </Collapsible>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}
