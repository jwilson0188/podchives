/**
 * Embedding worker.
 *
 * Handles `embedding` and `indexing` jobs:
 *   - `embedding` walks all transcript segments for an episode and writes
 *     vectors into transcript_segments.transcript_embedding via raw SQL.
 *   - `indexing` is mostly a no-op for now (pgvector creates the index at
 *     migration time). Marking the episode `isSearchable=true` is the real
 *     side-effect.
 */
import { generateSegmentEmbeddings } from "@/lib/embeddings";
import {
  markJobCompleted,
  markJobFailed,
  updateJobStatus,
} from "@/lib/queue";

export async function runEmbeddingJob(jobId: string, episodeId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  try {
    const segCount = await db.transcriptSegment.count({ where: { episodeId } });
    if (segCount === 0) {
      throw new Error("No transcript segments — run transcription first");
    }

    await updateJobStatus(jobId, "embedding", { progressPercent: 10 });
    const { embedded } = await generateSegmentEmbeddings(episodeId);
    if (embedded === 0) {
      throw new Error("No segments were embedded");
    }
    await markJobCompleted(jobId);
    return { embedded };
  } catch (err: any) {
    await markJobFailed(jobId, err?.message ?? "Embedding failed");
    throw err;
  }
}

export async function runIndexingJob(jobId: string, episodeId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  try {
    const ep = await db.episode.findUnique({ where: { id: episodeId } });
    if (!ep) throw new Error(`Episode ${episodeId} not found`);
    if (!ep.isTranscribed) {
      throw new Error("Episode is not transcribed — cannot mark searchable");
    }
    const segCount = await db.transcriptSegment.count({ where: { episodeId } });
    if (segCount === 0) {
      throw new Error("No transcript segments — cannot mark searchable");
    }

    await updateJobStatus(jobId, "indexing", { progressPercent: 50 });
    await db.episode.update({
      where: { id: episodeId },
      data: { isSearchable: true, processingStatus: "completed" },
    });
    await markJobCompleted(jobId);
  } catch (err: any) {
    await markJobFailed(jobId, err?.message ?? "Indexing failed");
    throw err;
  }
}
