import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EpisodeShareActions } from "@/components/episodes/EpisodeShareActions";
import type { DemoEpisode } from "@/lib/demoData";
import { formatDate, formatDuration } from "@/lib/utils";

export function EpisodeCatalogTable({
  episodes,
  statusFilter,
}: {
  episodes: DemoEpisode[];
  statusFilter?: string;
}) {
  if (episodes.length === 0) {
    return (
      <div className="card p-12 text-center text-text-muted text-sm">
        {statusFilter === "searchable"
          ? "No fully searchable episodes yet. Episodes appear here once transcription and indexing finish."
          : statusFilter
            ? "No episodes match these filters."
            : "No episodes yet. Add a YouTube source to start ingesting."}
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {episodes.map((ep) => (
          <article
            key={ep.id}
            className="card p-4 flex gap-3"
          >
            <Link
              href={`/episodes/${ep.id}`}
              className="flex gap-3 min-w-0 flex-1"
            >
              <div className="w-20 h-14 rounded bg-bg-elevated overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ep.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm line-clamp-2">
                  {ep.episodeTitle}
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  {formatDate(ep.publishDate)} · {formatDuration(ep.durationSeconds)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={ep.processingStatus} />
                  {ep.isSearchable && (
                    <span className="pill bg-success-muted text-success text-[10px]">
                      searchable
                    </span>
                  )}
                </div>
              </div>
            </Link>
            <EpisodeShareActions
              episodeId={ep.id}
              episodeTitle={ep.episodeTitle}
              sourceUrl={ep.sourceUrl}
              publishDate={ep.publishDate}
              compact
            />
          </article>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-text-muted bg-bg-subtle">
                <th className="text-left font-medium px-4 py-3">Episode</th>
                <th className="text-left font-medium px-3 py-3">Published</th>
                <th className="text-left font-medium px-3 py-3">Duration</th>
                <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">
                  Source
                </th>
                <th className="text-left font-medium px-3 py-3">Transcript</th>
                <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">
                  Embed
                </th>
                <th className="text-left font-medium px-3 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Share</th>
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
                  <td className="px-3 py-3 text-text-muted whitespace-nowrap">
                    {formatDate(ep.publishDate)}
                  </td>
                  <td className="px-3 py-3 text-text-muted font-mono tabular-nums">
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
                        searchable
                      </span>
                    ) : (
                      <span className="pill bg-bg-elevated text-text-muted border border-border">
                        pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EpisodeShareActions
                      episodeId={ep.id}
                      episodeTitle={ep.episodeTitle}
                      sourceUrl={ep.sourceUrl}
                      publishDate={ep.publishDate}
                      compact
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
