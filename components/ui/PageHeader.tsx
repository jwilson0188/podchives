import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 pb-5 border-b border-border",
        className,
      )}
    >
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2 font-medium">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-text-muted mt-1.5 max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
