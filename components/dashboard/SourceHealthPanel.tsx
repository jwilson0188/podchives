import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SourceView } from "@/lib/data";
import { formatRelativeDate } from "@/lib/utils";

export function SourceHealthPanel({ sources }: { sources: SourceView[] }) {
  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold tracking-tight">Sources</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Where your content comes from
          </p>
        </div>
        <Link
          href="/sources"
          className="text-xs text-accent hover:text-accent-hover"
        >
          Manage →
        </Link>
      </div>

      {sources.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-text-muted mb-3">
            No sources connected yet.
          </p>
          <Link href="/sources#add-source" className="btn-primary text-sm">
            Add your first source
          </Link>
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {sources.slice(0, 4).map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 bg-bg-subtle rounded-lg border border-border p-3"
            >
              <div className="w-8 h-8 rounded bg-accent-muted text-accent flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <rect x="2" y="5" width="20" height="14" rx="3" />
                  <polygon
                    points="10,9 16,12 10,15"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {s.sourceName}
                </div>
                <div className="text-[11px] text-text-muted">
                  {s.episodesFound} episodes
                  {s.lastSyncedAt && (
                    <> · synced {formatRelativeDate(s.lastSyncedAt)}</>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <StatusBadge status={s.syncStatus} />
                {s.autoSync && (
                  <span className="text-[9px] uppercase tracking-wider text-accent">
                    auto
                  </span>
                )}
              </div>
            </div>
          ))}
          {sources.length > 4 && (
            <Link
              href="/sources"
              className="block text-center text-xs text-text-muted hover:text-accent pt-2"
            >
              +{sources.length - 4} more sources
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
