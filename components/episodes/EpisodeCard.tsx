import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EpisodeShareActions } from "@/components/episodes/EpisodeShareActions";
import type { DemoEpisode } from "@/lib/demoData";
import { formatDate, formatDuration } from "@/lib/utils";

export function EpisodeCard({ episode }: { episode: DemoEpisode }) {
  return (
    <article className="card card-hover overflow-hidden flex flex-col group">
      <Link
        href={`/episodes/${episode.id}`}
        className="flex flex-col flex-1"
      >
        <div className="aspect-video bg-bg-elevated relative overflow-hidden border-b border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={episode.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white text-[11px] font-mono tabular-nums">
            {formatDuration(episode.durationSeconds)}
          </div>
          <div className="absolute top-2 left-2">
            <StatusBadge status={episode.processingStatus} />
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-semibold text-sm text-text-primary line-clamp-2 group-hover:text-accent transition-colors">
            {episode.episodeTitle}
          </h3>
          <div className="mt-2 text-[11px] text-text-muted font-mono">
            {formatDate(episode.publishDate)}
            {episode.episodeNumber != null && <> · ep.{episode.episodeNumber}</>}
          </div>
        </div>
      </Link>
      <div className="px-4 pb-3 pt-0 border-t border-border/50">
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
