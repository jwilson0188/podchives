/**
 * Embedding worker.
 *
 * Handles `embedding` and `indexing` jobs:
 *   - `embedding` walks all transcript segments for an episode and writes
 *     vectors into transcript_segments.transcript_embedding via raw SQL.
 *   - `indexing` atomically publishes search readiness and job completion.
 *     Database indexes require separate reviewed provisioning.
 */
import { generateSegmentEmbeddings } from "@/lib/embeddings";
import { isSupersededTranscriptJob, publishTranscriptSearchability, TranscriptChangedError } from "@/lib/transcriptIntegrity";
import {
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
    const { embedded } = await generateSegmentEmbeddings(episodeId, 64, jobId);
    if (embedded === 0) {
      throw new Error("No segments were embedded");
    }
    return { embedded };
  } catch (err: any) {
    if (err instanceof TranscriptChangedError || await isSupersededTranscriptJob(db, jobId)) throw new TranscriptChangedError();
    await markJobFailed(jobId, err?.message ?? "Embedding failed");
    throw err;
  }
}

export async function runIndexingJob(jobId: string, episodeId: string) {
  const { getDb } = await import("@/lib/db");
  const db = getDb();

  try {
    await updateJobStatus(jobId, "indexing", { progressPercent: 50 });
    await publishTranscriptSearchability(db, episodeId, jobId);
  } catch (err: any) {
    if (err instanceof TranscriptChangedError || await isSupersededTranscriptJob(db, jobId)) throw new TranscriptChangedError();
    await markJobFailed(jobId, err?.message ?? "Indexing failed");
    throw err;
  }
}
