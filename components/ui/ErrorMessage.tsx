import { cn } from "@/lib/utils";

export function ErrorMessage({
  children,
  className,
  compact,
}: {
  children: React.ReactNode;
  className?: string;
  /** Inline variant for tables and dense rows. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p
        className={cn(
          "text-[11px] text-danger font-mono mt-1 min-w-0 break-words [overflow-wrap:anywhere]",
          className,
        )}
      >
        {children}
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
      <svg
        className="w-3.5 h-3.5 shrink-0 mt-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
      </svg>
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] leading-relaxed">
        {children}
      </span>
    </div>
  );
}
