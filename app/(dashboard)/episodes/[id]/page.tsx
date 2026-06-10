import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TranscriptViewer } from "@/components/episodes/TranscriptViewer";
import {
  getEpisode,
  getPrimaryPodcast,
  getSegmentsForEpisode,
} from "@/lib/data";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EpisodeDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { t?: string };
}) {
  const [ep, segments, podcast] = await Promise.all([
    getEpisode(params.id),
    getSegmentsForEpisode(params.id),
    getPrimaryPodcast(),
  ]);
  if (!ep) notFound();

  const initialT = searchParams.t ? parseInt(searchParams.t, 10) || 0 : 0;

  return (
    <div>
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
            <a
              href={ep.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              Open source
            </a>
          </>
        }
      />

      <TranscriptViewer
        episodeTitle={ep.episodeTitle}
        sourceUrl={ep.sourceUrl}
        thumbnailUrl={ep.thumbnailUrl}
        segments={segments}
        initialSeconds={initialT}
      />
    </div>
  );
}
