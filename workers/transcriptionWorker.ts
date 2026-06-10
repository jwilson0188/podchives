/**
 * Transcription worker.
 *
 * Handles two job types as separate steps so the queue UI can show progress
 * cleanly and so each step can be retried independently:
 *
 *   - `transcription`            → Whisper API call, stores Whisper-native
 *                                  segments verbatim, marks isTranscribed.
 *   - `transcript_segmentation`  → re-packs the existing segments into
 *                                  embedding-friendly ~30s chunks.
 *
 * If you only need the simple path (transcribe + segment in one job),
 * `transcribeEpisode` in lib/transcription does it.
 */
import {
  markEpisodeTranscribed,
  saveTranscriptSegments,
  segmentTranscript,
  transcribeAudio,
  type TranscriptSegment,
} from "@/lib/transcription";
import {
  markJobCompleted,
  markJobFailed,
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
  if (!ep.audioFilePath) {
    const msg = "audio_file_path is empty — run download first";
    await markJobFailed(jobId, msg);
    throw new Error(msg);
  }

  try {
    await updateJobStatus(jobId, "transcribing", { progressPercent: 10 });
    const result = await transcribeAudio(ep.audioFilePath);
    await updateJobProgress(jobId, 80);

    // Store Whisper's native segments. Segmentation happens in a follow-up
    // job so it can be retried/tuned independently.
    await saveTranscriptSegments({
      episodeId,
      podcastId: ep.podcastId,
      sourceUrl: ep.sourceUrl,
      sourcePlatform: ep.sourcePlatform,
      transcriptSourceType: "whisper_api",
      segments: result.segments,
      replace: true,
    });

    await markEpisodeTranscribed(episodeId);
    await markJobCompleted(jobId);
    return { segments: result.segments.length };
  } catch (err: any) {
    await markJobFailed(jobId, err?.message ?? "Transcription failed");
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

    // Re-pack into ~30s embedding-friendly chunks. Reuse the same packer
    // from lib/transcription so behaviour is identical.
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

    await saveTranscriptSegments({
      episodeId,
      podcastId: ep.podcastId,
      sourceUrl: ep.sourceUrl,
      sourcePlatform: ep.sourcePlatform,
      transcriptSourceType: "whisper_api",
      segments: packed,
      replace: true,
    });

    await markJobCompleted(jobId);
    return { segments: packed.length };
  } catch (err: any) {
    await markJobFailed(jobId, err?.message ?? "Segmentation failed");
    throw err;
  }
}
