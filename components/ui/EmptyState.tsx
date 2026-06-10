import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card border-dashed flex flex-col items-center justify-center text-center py-12 px-6",
        className,
      )}
    >
      <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center text-text-muted mb-4">
        {icon ?? (
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-text-muted max-w-md">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
