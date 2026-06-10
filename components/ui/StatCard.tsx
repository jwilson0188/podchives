import { cn } from "@/lib/utils";

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
  const accentRing: Record<string, string> = {
    default: "",
    cyan: "after:bg-cyan",
    success: "after:bg-success",
    warn: "after:bg-warn",
    danger: "after:bg-danger",
  };

  const Tag: any = href ? "a" : "div";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={cn(
        "card card-hover p-5 relative overflow-hidden block",
        "after:content-[''] after:absolute after:left-0 after:top-0 after:bottom-0 after:w-[2px]",
        accentRing[accent ?? "default"],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-widest text-text-muted font-medium">
          {label}
        </div>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-text-primary tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-text-dim">{hint}</div>}
    </Tag>
  );
}
