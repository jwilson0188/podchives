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
        "mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="mb-1 text-[0.8125rem] text-ink-muted break-words">
            {eyebrow}
          </p>
        )}
        <h1 className="title-page break-words [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-secondary break-words">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end md:pt-1">
          {actions}
        </div>
      )}
    </div>
  );
}
