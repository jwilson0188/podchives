import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DemoEpisode } from "@/lib/demoData";
import { formatDate, formatDuration } from "@/lib/utils";

export function EpisodeCatalogTable({
  episodes,
}: {
  episodes: DemoEpisode[];
}) {
  if (episodes.length === 0) {
    return (
      <div className="card p-12 text-center text-text-muted text-sm">
        No episodes yet. Add a YouTube source to start ingesting.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-text-muted bg-bg-subtle">
              <th className="text-left font-medium px-4 py-3">Episode</th>
              <th className="text-left font-medium px-3 py-3 hidden md:table-cell">
                Published
              </th>
              <th className="text-left font-medium px-3 py-3 hidden md:table-cell">
                Duration
              </th>
              <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">
                Source
              </th>
              <th className="text-left font-medium px-3 py-3">Transcript</th>
              <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">
                Embed
              </th>
              <th className="text-left font-medium px-3 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((ep) => (
              <tr key={ep.id} className="table-row">
                <td className="px-4 py-3">
                  <Link
                    href={`/episodes/${ep.id}`}
                    className="flex items-center gap-3 group"
                  >
                    <div className="w-16 h-10 rounded bg-bg-elevated overflow-hidden flex-shrink-0 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ep.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover opacity-90"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                          <svg
                            className="w-3 h-3 text-white"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="6,4 20,12 6,20" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate text-text-primary group-hover:text-accent transition-colors">
                        {ep.episodeTitle}
                      </div>
                      <div className="text-[11px] text-text-muted font-mono">
                        {ep.externalId}
                        {ep.episodeNumber != null && (
                          <> · ep.{ep.episodeNumber}</>
                        )}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 hidden md:table-cell text-text-muted whitespace-nowrap">
                  {formatDate(ep.publishDate)}
                </td>
                <td className="px-3 py-3 hidden md:table-cell text-text-muted font-mono tabular-nums">
                  {formatDuration(ep.durationSeconds)}
                </td>
                <td className="px-3 py-3 hidden lg:table-cell">
                  <span className="pill bg-bg-elevated text-text-muted border border-border">
                    {ep.sourcePlatform}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={ep.transcriptStatus} />
                </td>
                <td className="px-3 py-3 hidden lg:table-cell">
                  <StatusBadge status={ep.embeddingStatus} />
                </td>
                <td className="px-3 py-3">
                  {ep.isSearchable ? (
                    <span className="pill bg-success-muted text-success">
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="m5 12 5 5 9-11" strokeLinecap="round" />
                      </svg>
                      searchable
                    </span>
                  ) : (
                    <span className="pill bg-bg-elevated text-text-muted border border-border">
                      pending
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link
                    href={`/episodes/${ep.id}`}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
