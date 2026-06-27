import { cn } from "@/lib/utils";

/** Responsive 16:9 container — keeps iframes from overflowing on narrow viewports. */
export function VideoEmbed({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "video-embed w-full min-w-0 max-w-full rounded-xl overflow-hidden border border-border bg-black relative",
        className,
      )}
    >
      {children}
    </div>
  );
}
