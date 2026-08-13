/**
 * Transcription worker.
 *
 *   - `transcription`           → YouTube captions (free) or Groq/OpenAI Whisper
 *   - `transcript_segmentation` → re-pack segments into ~30s embedding chunks
 */
import {
  markEpisodeTranscribed,
  resolveTranscription,
  saveTranscriptSegments,
  segmentTranscript,
  type TranscriptSegment,
} from "@/lib/transcription";
import { shouldTryRssFeedTranscript, shouldTryYouTubeCaptions } from "@/lib/transcriptionConfig";
import {
  markJobFailed,
  queueAudioFallbackDownload,
  updateJobProgress,
  updateJobStatus,
} from "@/lib/queue";

export async function runTranscriptionJob(jobId: string, episodeId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const ep = await db.episode.findUnique({ where: { id: episodeId } });
  if (!ep) {
    const msg = `Episode ${episodeId} not found`;
    await markJobFailed(jobId, msg);
    throw new Error(msg);
  }
  if (!ep.sourceUrl) {
    const msg = "episode has no source_url";
    await markJobFailed(jobId, msg);
    throw new Error(msg);
  }
  const captionsOnly = shouldTryYouTubeCaptions(ep.sourcePlatform);
  const feedTranscriptOnly = shouldTryRssFeedTranscript(
    ep.transcriptOriginalUrl,
    ep.sourcePlatform,
  );
  if (!ep.audioFilePath && !captionsOnly && !feedTranscriptOnly) {
    const msg = "audio_file_path is empty — run download first";
    await markJobFailed(jobId, msg);
    throw new Error(msg);
  }

  try {
    await updateJobStatus(jobId, "transcribing", { progressPercent: 10 });
    const resolved = await resolveTranscription({
      episodeId,
      audioFilePath: ep.audioFilePath ?? "",
      sourceUrl: ep.sourceUrl,
      sourcePlatform: ep.sourcePlatform,
      transcriptOriginalUrl: ep.transcriptOriginalUrl,
    });
    await updateJobProgress(jobId, 80);

    await saveTranscriptSegments({
      episodeId,
      podcastId: ep.podcastId,
      sourceUrl: ep.sourceUrl,
      sourcePlatform: ep.sourcePlatform,
      transcriptSourceType: resolved.transcriptSourceType,
      segments: resolved.segments,
      replace: true,
    });

    await markEpisodeTranscribed(episodeId);
    await updateJobProgress(jobId, 100);
    return { segments: resolved.segments.length };
  } catch (err: any) {
    const reason = err?.message ?? "Transcription failed";

    // Captions / feed transcript were expected to cover this episode, so the
    // pipeline skipped the audio download. They didn't pan out — fall back to
    // fetching audio for Whisper instead of killing the episode outright.
    if (!ep.audioFilePath) {
      const queued = await queueAudioFallbackDownload(episodeId);
      if (queued) {
        const msg = `${reason} — queued audio download so Whisper can retry`;
        await markJobFailed(jobId, msg);
        throw new Error(msg);
      }
    }

    await markJobFailed(jobId, reason);
    throw err;
  }
}

export async function runSegmentationJob(jobId: string, episodeId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const ep = await db.episode.findUnique({ where: { id: episodeId } });
  if (!ep) {
    const msg = `Episode ${episodeId} not found`;
    await markJobFailed(jobId, msg);
    throw new Error(msg);
  }

  try {
    await updateJobStatus(jobId, "segmenting", { progressPercent: 30 });
    const existing = await db.transcriptSegment.findMany({
      where: { episodeId },
      orderBy: { startTimeSeconds: "asc" },
    });
    if (existing.length === 0) {
      const msg = "No transcript segments to pack";
      await markJobFailed(jobId, msg);
      throw new Error(msg);
    }

    const fakeResult = {
      fullText: existing.map((s) => s.transcriptText).join(" "),
      language: null,
      segments: existing.map(
        (s): TranscriptSegment => ({
          startTimeSeconds: s.startTimeSeconds,
          endTimeSeconds: s.endTimeSeconds,
          transcriptText: s.transcriptText,
          confidenceScore: s.confidenceScore,
        }),
      ),
    };
    const packed = segmentTranscript(fakeResult);
    const transcriptSourceType =
      (existing[0]?.transcriptSourceType as
        | "whisper_api"
        | "youtube_captions"
        | "rss_feed"
        | "whisper_local"
        | "manual") ?? "whisper_api";

    await saveTranscriptSegments({
      episodeId,
      podcastId: ep.podcastId,
      sourceUrl: ep.sourceUrl,
      sourcePlatform: ep.sourcePlatform,
      transcriptSourceType,
      segments: packed,
      replace: true,
    });

    await updateJobProgress(jobId, 100);
    return { segments: packed.length };
  } catch (err: any) {
    await markJobFailed(jobId, err?.message ?? "Segmentation failed");
    throw err;
  }
}
