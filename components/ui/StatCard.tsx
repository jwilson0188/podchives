import { cn } from "@/lib/utils";

/**
 * A single metric. The number is the point — the label sits quietly above it
 * in sentence case, and colour is used only when the status actually differs
 * from neutral.
 */
export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "cyan" | "success" | "warn" | "danger";
  icon?: React.ReactNode;
  href?: string;
}) {
  const valueTone: Record<string, string> = {
    default: "text-ink",
    cyan: "text-ink",
    success: "text-ink",
    warn: "text-caution",
    danger: "text-critical",
  };

  const Tag: any = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "card p-4 block",
        href && "card-hover cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-ink-secondary">{label}</span>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      <div
        className={cn(
          "mt-1.5 text-[1.75rem] font-semibold tracking-[-0.02em] tabular",
          valueTone[accent ?? "default"],
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[0.8125rem] text-ink-muted">{hint}</div>}
    </Tag>
  );
}
