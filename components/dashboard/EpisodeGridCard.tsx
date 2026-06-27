import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EpisodeShareActions } from "@/components/episodes/EpisodeShareActions";
import type { EpisodeView } from "@/lib/data";
import { formatDate, formatDuration } from "@/lib/utils";

/** Episode tile for dashboard grids — thumbnail + share/export actions. */
export function EpisodeGridCard({ episode }: { episode: EpisodeView }) {
  return (
    <article className="group bg-bg-subtle rounded-lg border border-border overflow-hidden hover:border-border-strong transition-colors flex flex-col">
      <Link
        href={`/episodes/${episode.id}`}
        className="block flex-1"
      >
        <div className="aspect-video bg-bg-elevated relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={episode.thumbnailUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute top-2 right-2">
            <StatusBadge status={episode.processingStatus} />
          </div>
          {episode.isSearchable && (
            <div className="absolute bottom-2 left-2 pill bg-success-muted text-success text-[10px] border border-success/30">
              searchable
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-sm font-medium line-clamp-2 group-hover:text-accent transition-colors">
            {episode.episodeTitle}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            {formatDate(episode.publishDate)} ·{" "}
            {formatDuration(episode.durationSeconds)}
          </div>
        </div>
      </Link>
      <div className="px-3 pb-3 pt-0 border-t border-border/50 flex items-center justify-between">
        <EpisodeShareActions
          episodeId={episode.id}
          episodeTitle={episode.episodeTitle}
          sourceUrl={episode.sourceUrl}
          publishDate={episode.publishDate}
          compact
        />
      </div>
    </article>
  );
}
