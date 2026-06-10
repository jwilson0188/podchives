import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SourceView } from "@/lib/data";
import { formatRelativeDate } from "@/lib/utils";
import { SyncNowButton } from "./SyncNowButton";

const PLATFORM_LABELS: Record<string, string> = {
  youtube_channel: "YouTube channel",
  youtube_playlist: "YouTube playlist",
  youtube_video: "YouTube video",
  rss_future: "RSS feed",
  manual_upload_future: "Manual upload",
  patreon_future: "Patreon",
};

export function SourceCard({ source }: { source: SourceView }) {
  return (
    <div className="card p-4 flex items-start gap-4">
      <div className="w-10 h-10 rounded-md bg-accent-muted text-accent flex items-center justify-center flex-shrink-0">
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <rect x="2" y="5" width="20" height="14" rx="3" />
          <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold truncate">{source.sourceName}</h3>
          <StatusBadge status={source.syncStatus} />
        </div>
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-0.5 text-xs text-text-muted font-mono truncate hover:text-cyan"
        >
          {source.sourceUrl}
        </a>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-text-dim">
          <span>{PLATFORM_LABELS[source.sourceType]}</span>
          <span>·</span>
          <span>{source.episodesFound} episodes</span>
          {source.lastSyncedAt && (
            <>
              <span>·</span>
              <span>synced {formatRelativeDate(source.lastSyncedAt)}</span>
            </>
          )}
        </div>
      </div>
      <SyncNowButton sourceId={source.id} />
    </div>
  );
}
