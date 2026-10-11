import { activeJobWhere } from "./jobControl";
import { PipelineJobNotActiveError } from "./queueTransitions";
import type { Episode, PrismaClient } from "@prisma/client";
import type { JobType } from "./constants";
import { EPISODE_PIPELINE, isAudioFilePath } from "./pipeline";
import { getTranscriptionBackend, shouldTryRssFeedTranscript, shouldTryYouTubeCaptions, type TranscriptionBackend } from "./transcriptionConfig";
import { hasUsableLocalFile } from "./mediaArtifacts";

const INFLIGHT = ["running", "downloading", "extracting_audio", "transcribing", "segmenting", "embedding", "indexing"];
type ResumeEpisode = Pick<Episode, "isSearchable" | "isTranscribed" | "isEmbedded" | "transcriptStatus" | "embeddingStatus" | "audioFilePath" | "thumbnailOriginalUrl" | "sourcePlatform" | "transcriptOriginalUrl">;
export type ResumeEvidence = {
  segments: number; embedded: number; needsSegmentation: boolean;
  audioAvailable: boolean; thumbnailAvailable: boolean; transcriptionFailed: boolean;
};

export function planEpisodeResume(ep: ResumeEpisode, evidence: ResumeEvidence, backend: TranscriptionBackend): JobType | null {
  if (evidence.segments > 0) {
    if (!ep.isTranscribed || ep.transcriptStatus !== "completed" || evidence.needsSegmentation) return "transcript_segmentation";
    if (!ep.isEmbedded || ep.embeddingStatus !== "completed" || evidence.embedded !== evidence.segments) return "embedding";
    return ep.isSearchable ? null : "indexing";
  }
  if (evidence.audioAvailable) return isAudioFilePath(ep.audioFilePath!) ? "transcription" : "audio_extract";
  if (!evidence.transcriptionFailed && ep.thumbnailOriginalUrl && !evidence.thumbnailAvailable) return "thumbnail_cache";
  if (!evidence.transcriptionFailed && (shouldTryYouTubeCaptions(ep.sourcePlatform, backend)
    || shouldTryRssFeedTranscript(ep.transcriptOriginalUrl, ep.sourcePlatform))) return "transcription";
  return "download";
}

export type AdmissionOptions = {
  sourceJobId?: string;
  backend?: TranscriptionBackend;
  artifactAvailable?: typeof hasUsableLocalFile;
  limits?: { maxQueuedEpisodesPerSource: number; maxInflightEpisodesPerSource: number };
};

/** Source → Episode lock order: serialize source caps, then episode dedup/resume.
 * Provider/download work never runs here; reads inspect this worker's local disk.
 */
export async function admitEpisodeProcessing(db: PrismaClient, episodeId: string, options: AdmissionOptions = {}) {
  const initial = await db.episode.findUnique({ where: { id: episodeId }, select: { sourceId: true } });
  if (!initial) return null;
  const artifactAvailable = options.artifactAvailable ?? hasUsableLocalFile;
  return db.$transaction(async (tx) => {
    const sources = await tx.$queryRaw<{ id: string; source_type: string }[]>`SELECT id, source_type FROM sources WHERE id=${initial.sourceId} FOR UPDATE`;
    if (!sources.length) return null;
    if (options.sourceJobId && !await tx.processingJob.findFirst({ where: { id: options.sourceJobId, sourceId: initial.sourceId, jobType: "source_sync", ...activeJobWhere } })) throw new PipelineJobNotActiveError();
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM episodes WHERE id=${episodeId} FOR UPDATE`;
    if (!locked.length) return null;
    const ep = await tx.episode.findUnique({ where: { id: episodeId } });
    if (!ep || ep.sourceId !== initial.sourceId) throw new Error("Episode source changed during admission; retry required");
    const active = await tx.processingJob.findFirst({ where: {
      episodeId, jobType: { in: EPISODE_PIPELINE }, status: { in: ["queued", ...INFLIGHT] },
    }, select: { id: true } });
    if (active) return null;
    const stopped = await tx.processingJob.findFirst({ where: { episodeId, status: "failed", errorMessage: "Stopped by user" }, select: { id: true } });
    if (stopped) return null; // Automatic sync must not undo an explicit stop.
    const limits = options.limits ?? getQueueLimits(sources[0].source_type);
    const base = { episode: { sourceId: initial.sourceId }, jobType: { in: EPISODE_PIPELINE } };
    const queued = await tx.processingJob.findMany({ where: { ...base, status: "queued" }, select: { episodeId: true }, distinct: ["episodeId"] });
    const inflight = await tx.processingJob.findMany({ where: { ...base, status: { in: INFLIGHT } }, select: { episodeId: true }, distinct: ["episodeId"] });
    if (queued.length >= limits.maxQueuedEpisodesPerSource || inflight.length >= limits.maxInflightEpisodesPerSource) return null;
    const [coverage] = await tx.$queryRaw<{ total: number; embedded: number }[]>`SELECT count(*)::int AS total, count(transcript_embedding)::int AS embedded FROM transcript_segments WHERE episode_id=${episodeId}`;
    const unsegmented = await tx.processingJob.findFirst({ where: { episodeId, jobType: "transcription", status: "completed", errorMessage: null }, select: { id: true } });
    const failed = await tx.processingJob.findFirst({ where: { episodeId, jobType: "transcription", status: "failed" }, select: { id: true } });
    // Existing transcript rows outrank local media. Do not touch/read old files
    // merely to resume embedding/indexing of a caption-only episode.
    const hasSegments = (coverage?.total ?? 0) > 0;
    const audioAvailable = !hasSegments && await artifactAvailable(ep.audioFilePath);
    const thumbnailAvailable = !hasSegments && !audioAvailable && await artifactAvailable(ep.thumbnailLocalPath);
    const next = planEpisodeResume(ep, {
      segments: coverage?.total ?? 0, embedded: coverage?.embedded ?? 0,
      needsSegmentation: Boolean(unsegmented), transcriptionFailed: Boolean(failed),
      audioAvailable, thumbnailAvailable,
    }, options.backend ?? getTranscriptionBackend());
    if (!next) return null;
    return tx.processingJob.create({ data: { episodeId, jobType: next, status: "queued", progressPercent: 0 } });
  }, { timeout: 30_000 });
}
export function getQueueLimits(sourceType?: string) {
  const isRss = sourceType === "rss" || sourceType === "rss_future";
  return {
    maxQueuedEpisodesPerSource: Math.max(
      1,
      Number(
        isRss
          ? process.env.MAX_QUEUED_EPISODES_PER_SOURCE_RSS ||
              process.env.MAX_QUEUED_EPISODES_PER_SOURCE
          : process.env.MAX_QUEUED_EPISODES_PER_SOURCE,
      ) || (isRss ? 75 : 50),
    ),
    maxInflightEpisodesPerSource: Math.max(
      1,
      Number(
        isRss
          ? process.env.MAX_INFLIGHT_EPISODES_PER_SOURCE_RSS ||
              process.env.MAX_INFLIGHT_EPISODES_PER_SOURCE
          : process.env.MAX_INFLIGHT_EPISODES_PER_SOURCE,
      ) || (isRss ? 20 : 15),
    ),
    maxEpisodesQueuedPerSync: Math.max(
      1,
      Number(
        isRss
          ? process.env.MAX_EPISODES_QUEUED_PER_SYNC_RSS ||
              process.env.MAX_EPISODES_QUEUED_PER_SYNC
          : process.env.MAX_EPISODES_QUEUED_PER_SYNC,
      ) || (isRss ? 100 : 50),
    ),
  };
}
