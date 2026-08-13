"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export function Collapsible({
  title,
  summary,
  children,
  defaultOpen = false,
  className,
  headerClassName,
  contentClassName,
  variant = "default",
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  variant?: "default" | "danger" | "card";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  const variantClasses = {
    default: "border-border bg-bg-subtle/80",
    danger: "border-danger/30 bg-danger-muted",
    card: "border-border bg-bg-card",
  };

  return (
    <div
      className={cn(
        "rounded-lg border min-w-0 overflow-hidden",
        variantClasses[variant],
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-elevated/30",
          headerClassName,
        )}
      >
        <svg
          className={cn(
            "w-4 h-4 shrink-0 mt-0.5 text-text-muted transition-transform duration-200",
            open && "rotate-90",
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="min-w-0">{title}</div>
          {!open && summary != null && summary !== "" && (
            <div className="text-[0.8125rem] text-text-muted mt-0.5 line-clamp-2 break-words [overflow-wrap:anywhere]">
              {summary}
            </div>
          )}
        </div>
      </button>
      {open && (
        <div
          id={panelId}
          className={cn(
            "px-3 pb-3 pt-2 border-t border-border/40 min-w-0",
            contentClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function collapsePreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}
