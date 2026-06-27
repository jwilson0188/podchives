import Link from "next/link";
import type { PodcastView } from "@/lib/data";
import { formatRelativeDate } from "@/lib/utils";

/** Compact archive cards when the creator runs multiple shows. */
export function ArchiveTiles({ archives }: { archives: PodcastView[] }) {
  if (archives.length <= 1) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight">Your archives</h2>
        <Link
          href="/archives"
          className="text-xs text-accent hover:text-accent-hover"
        >
          View all →
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {archives.slice(0, 3).map((a) => {
          const pct =
            a.episodeCount > 0
              ? Math.round((a.searchableCount / a.episodeCount) * 100)
              : 0;
          return (
            <Link
              key={a.id}
              href={`/episodes?archive=${a.id}`}
              className="card card-hover p-4 flex gap-3"
            >
              <div className="w-12 h-12 rounded-md overflow-hidden bg-bg-elevated flex-shrink-0 border border-border">
                {a.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.coverImageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-lg font-semibold">
                    {a.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{a.name}</div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {a.searchableCount}/{a.episodeCount} searchable · {pct}%
                </div>
                <div className="mt-2 h-1 rounded-full bg-bg-elevated overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-text-dim mt-1">
                  synced {formatRelativeDate(a.lastSyncedAt)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
