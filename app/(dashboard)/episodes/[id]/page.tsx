import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TranscriptViewer } from "@/components/episodes/TranscriptViewer";
import { EpisodeComputeCost } from "@/components/episodes/EpisodeComputeCost";
import { EpisodeShareActions } from "@/components/episodes/EpisodeShareActions";
import {
  getEpisodeUsage,
  getEpisodeWithContext,
  getSegmentsForEpisode,
} from "@/lib/data";
import { formatDate, formatDuration } from "@/lib/utils";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  youtube_channel: "YouTube channel",
  youtube_playlist: "YouTube playlist",
  youtube_video: "YouTube video",
  rss_future: "RSS feed",
  manual_upload_future: "Manual upload",
  patreon_future: "Patreon",
};

export default async function EpisodeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, segments, usage] = await Promise.all([
    getEpisodeWithContext(params.id),
    getSegmentsForEpisode(params.id),
    getEpisodeUsage(params.id),
  ]);
  if (!detail) notFound();

  const { episode: ep, podcast, source } = detail;
  const sourceTypeLabel =
    SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType;

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <Link
          href="/episodes"
          className="text-xs text-text-muted hover:text-text-primary inline-flex items-center gap-1"
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All episodes
        </Link>
      </div>

      <PageHeader
        eyebrow={`${podcast.name} · ${ep.sourcePlatform}`}
        title={ep.episodeTitle}
        description={`Published ${formatDate(ep.publishDate)} · ${formatDuration(
          ep.durationSeconds,
        )}${ep.episodeNumber != null ? ` · Episode ${ep.episodeNumber}` : ""}`}
        actions={
          <>
            <StatusBadge status={ep.processingStatus} />
            <EpisodeShareActions
              episodeId={ep.id}
              episodeTitle={ep.episodeTitle}
              sourceUrl={ep.sourceUrl}
              podcastName={podcast.name}
              publishDate={ep.publishDate}
            />
            <a
              href={ep.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs hidden sm:inline-flex"
            >
              Open source
            </a>
          </>
        }
      />

      <Suspense fallback={null}>
        <TranscriptViewer
          episodeTitle={ep.episodeTitle}
          archiveName={podcast.name}
          sourceName={source.sourceName}
          sourceChannelUrl={source.sourceUrl}
          sourceTypeLabel={sourceTypeLabel}
          videoUrl={ep.sourceUrl}
          thumbnailUrl={ep.thumbnailUrl}
          segments={segments}
        />
      </Suspense>

      {usage && (usage.audioBytes > 0 || usage.embeddingTokens > 0 || usage.isTranscribed) && (
        <EpisodeComputeCost usage={usage} />
      )}
    </div>
  );
}
