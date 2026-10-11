import type { Prisma, PrismaClient } from "@prisma/client";
import type { TranscriptSegment } from "./transcription";

// Discovery durations are rounded to seconds; hosted/caption timings may extend
// slightly beyond that boundary. Unknown (null) durations have no upper bound.
export const TRANSCRIPT_DURATION_TOLERANCE_SECONDS = 2;
export const SUPERSEDED_TRANSCRIPT_MESSAGE = "superseded: transcript changed";
export const TRANSCRIPT_JOB_TYPES = ["transcription", "transcript_segmentation", "embedding", "indexing"] as const;

export class TranscriptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptValidationError";
  }
}

export class TranscriptChangedError extends Error {
  constructor() {
    super(SUPERSEDED_TRANSCRIPT_MESSAGE);
    this.name = "TranscriptChangedError";
  }
}

export type SaveTranscriptArgs = {
  episodeId: string;
  podcastId: string;
  sourceUrl: string;
  sourcePlatform: string;
  transcriptSourceType:
    | "whisper_local"
    | "whisper_api"
    | "youtube_captions"
    | "rss_feed"
    | "manual";
  segments: TranscriptSegment[];
  replace?: boolean;
  // Capture before provider work / reading segments for packing, so an older
  // operation cannot replace a newer committed transcript.
  expectedSegmentIds?: readonly string[];
  processingJobId?: string;
  nextJobType?: "transcript_segmentation" | "embedding";
};

type ReadDb = Pick<Prisma.TransactionClient, "episode" | "transcriptSegment">;
const EPISODE_SELECT = {
  id: true,
  podcastId: true,
  sourceUrl: true,
  sourcePlatform: true,
  durationSeconds: true,
} as const;
type TranscriptEpisode = Prisma.EpisodeGetPayload<{ select: typeof EPISODE_SELECT }>;

function invalid(message: string): never {
  throw new TranscriptValidationError(message);
}

function requiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) invalid(`${field} is required`);
}

/** Validate/copy before awaiting anything; never mutate, dedupe or reorder text. */
function validateInput(args: SaveTranscriptArgs): SaveTranscriptArgs {
  if (!args || typeof args !== "object") invalid("Transcript input is required");
  for (const field of ["episodeId", "podcastId", "sourceUrl", "sourcePlatform"] as const) {
    requiredString(args[field], field);
  }
  try {
    const url = new URL(args.sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol)) invalid("sourceUrl must be HTTP(S)");
  } catch {
    invalid("sourceUrl must be a valid HTTP(S) URL");
  }
  if (!["whisper_local", "whisper_api", "youtube_captions", "rss_feed", "manual"].includes(args.transcriptSourceType)) {
    invalid("transcriptSourceType is invalid");
  }
  if (args.replace !== undefined && typeof args.replace !== "boolean") invalid("replace must be boolean");
  if (args.nextJobType !== undefined && !["transcript_segmentation", "embedding"].includes(args.nextJobType)) {
    invalid("nextJobType is invalid");
  }
  if (args.processingJobId !== undefined) requiredString(args.processingJobId, "processingJobId");
  if (!Array.isArray(args.segments) || args.segments.length === 0) invalid("Transcript must contain segments");
  let previousStart = -1;
  const segments = args.segments.map((segment, index) => {
    if (!segment || typeof segment !== "object") invalid(`Segment ${index} is invalid`);
    requiredString(segment.transcriptText, `Segment ${index} text`);
    const { startTimeSeconds: start, endTimeSeconds: end, confidenceScore } = segment;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || end <= start) {
      invalid(`Segment ${index} must have finite timestamps with 0 <= start < end`);
    }
    if (start < previousStart) invalid(`Segment ${index} is not chronologically ordered`);
    if (confidenceScore != null && (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1)) {
      invalid(`Segment ${index} confidence must be null or between 0 and 1`);
    }
    previousStart = start;
    return { ...segment, confidenceScore: confidenceScore ?? null };
  });
  if (args.expectedSegmentIds !== undefined) {
    if (!Array.isArray(args.expectedSegmentIds)) invalid("expectedSegmentIds must be an array");
    args.expectedSegmentIds.forEach((id) => requiredString(id, "expected segment ID"));
    if (new Set(args.expectedSegmentIds).size !== args.expectedSegmentIds.length) invalid("Expected segment IDs must be unique");
  }
  return { ...args, segments, expectedSegmentIds: args.expectedSegmentIds?.slice() };
}

function validateEpisode(args: SaveTranscriptArgs, episode: TranscriptEpisode | null): asserts episode is TranscriptEpisode {
  if (!episode) invalid("Episode does not exist");
  if (episode.podcastId !== args.podcastId || episode.sourceUrl !== args.sourceUrl || episode.sourcePlatform !== args.sourcePlatform) {
    invalid("Transcript attribution does not match its episode");
  }
  const duration = episode.durationSeconds;
  if (duration !== null) {
    if (!Number.isFinite(duration) || duration <= 0) invalid("Episode duration must be positive or unknown");
    if (args.segments.some((s) => s.endTimeSeconds > duration + TRANSCRIPT_DURATION_TOLERANCE_SECONDS)) {
      invalid(`Transcript exceeds episode duration by more than ${TRANSCRIPT_DURATION_TOLERANCE_SECONDS} seconds`);
    }
  }
}

export async function getTranscriptSegmentIds(db: ReadDb, episodeId: string): Promise<string[]> {
  const rows = await db.transcriptSegment.findMany({ where: { episodeId }, select: { id: true }, orderBy: { id: "asc" } });
  return rows.map((row) => row.id);
}

async function lockEpisode(tx: Prisma.TransactionClient, episodeId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM episodes WHERE id = ${episodeId} FOR UPDATE`;
  if (rows.length !== 1) invalid("Episode does not exist");
}

async function assertCurrentTranscript(tx: Prisma.TransactionClient, episodeId: string, expected: readonly string[]) {
  const ids = await getTranscriptSegmentIds(tx, episodeId);
  const sorted = [...expected].sort();
  if (ids.length !== sorted.length || ids.some((id, i) => id !== sorted[i])) throw new TranscriptChangedError();
}

async function assertCurrentJob(tx: Prisma.TransactionClient, episodeId: string, jobId: string, jobTypes: string[], allowCompleted = false) {
  const job = await tx.processingJob.findUnique({ where: { id: jobId } });
  if (!job || job.episodeId !== episodeId || !jobTypes.includes(job.jobType)) invalid("Processing job does not match the transcript operation");
  if (allowCompleted && job.status === "completed" && job.errorMessage === null) return job;
  if (!["running", "transcribing", "segmenting", "embedding", "indexing"].includes(job.status) || job.errorMessage?.startsWith("superseded:")) {
    throw new TranscriptChangedError();
  }
  return job;
}

export async function isSupersededTranscriptJob(db: Pick<PrismaClient, "processingJob">, jobId: string) {
  const job = await db.processingJob.findUnique({ where: { id: jobId }, select: { errorMessage: true } });
  return job?.errorMessage?.startsWith("superseded:") ?? false;
}

/** Failure/cancellation must serialize with replacement too, or an old failure
 * could cancel a new generation's jobs after waiting for replacement to commit. */
export async function failTranscriptJob(db: PrismaClient, episodeId: string, jobId: string, message: string) {
  return db.$transaction(async (tx) => {
    await lockEpisode(tx, episodeId);
    const job = await tx.processingJob.findUnique({ where: { id: jobId } });
    if (!job || job.episodeId !== episodeId || !TRANSCRIPT_JOB_TYPES.includes(job.jobType as typeof TRANSCRIPT_JOB_TYPES[number])) {
      invalid("Processing job does not match the transcript operation");
    }
    if (job.errorMessage?.startsWith("superseded:")) throw new TranscriptChangedError();
    // A duplicate attempt can fail after another attempt committed success.
    // Do not turn that committed job into a failure or cancel its successor.
    if (job.status === "failed" || (job.status === "completed" && job.errorMessage === null)) return;
    await tx.processingJob.update({ where: { id: jobId }, data: {
      status: "failed", errorMessage: message, completedAt: new Date(),
    } });
    // Separate duplicate jobs can finish/fail in either order. Once another
    // embedding job published this generation, its indexing work stays valid.
    if (job.jobType === "embedding") {
      const episode = await tx.episode.findUnique({ where: { id: episodeId } });
      if (episode?.isEmbedded && episode.embeddingStatus === "completed") return;
    }
    await tx.processingJob.updateMany({ where: {
      episodeId, status: "queued",
      jobType: { in: ["audio_extract", ...TRANSCRIPT_JOB_TYPES] },
    }, data: {
      status: "completed", progressPercent: 0,
      errorMessage: `cancelled: ${job.jobType} failed`, completedAt: new Date(),
    } });
  }, { timeout: 30_000 });
}

/** Atomic text, metadata and downstream-job publication. No provider calls. */
export async function persistTranscriptSegments(db: PrismaClient, input: SaveTranscriptArgs): Promise<number> {
  const args = validateInput(input);
  const episode = await db.episode.findUnique({ where: { id: args.episodeId }, select: EPISODE_SELECT });
  validateEpisode(args, episode);
  const expected = args.expectedSegmentIds ?? await getTranscriptSegmentIds(db, args.episodeId);
  const nextJobType = args.nextJobType ?? "embedding";

  return db.$transaction(async (tx) => {
    // All replacement/readiness writers take the same episode lock. Recheck
    // metadata and segment identity under it before issuing any mutation.
    await lockEpisode(tx, args.episodeId);
    validateEpisode(args, await tx.episode.findUnique({ where: { id: args.episodeId }, select: EPISODE_SELECT }));
    await assertCurrentTranscript(tx, args.episodeId, expected);
    if (args.processingJobId) await assertCurrentJob(tx, args.episodeId, args.processingJobId, [nextJobType === "transcript_segmentation" ? "transcription" : "transcript_segmentation"]);
    if (!args.replace) {
      const last = await tx.transcriptSegment.findFirst({ where: { episodeId: args.episodeId }, orderBy: { startTimeSeconds: "desc" }, select: { startTimeSeconds: true } });
      if (last && args.segments[0].startTimeSeconds < last.startTimeSeconds) invalid("Appended segments must follow the existing transcript");
    }
    if (args.replace) await tx.transcriptSegment.deleteMany({ where: { episodeId: args.episodeId } });
    const { count } = await tx.transcriptSegment.createMany({ data: args.segments.map((s) => ({
      episodeId: args.episodeId, podcastId: args.podcastId, sourceUrl: args.sourceUrl,
      sourcePlatform: args.sourcePlatform, transcriptSourceType: args.transcriptSourceType,
      startTimeSeconds: s.startTimeSeconds, endTimeSeconds: s.endTimeSeconds,
      transcriptText: s.transcriptText, confidenceScore: s.confidenceScore,
    })) });
    if (count !== args.segments.length) throw new Error("Transcript insert count mismatch");
    await tx.episode.update({ where: { id: args.episodeId }, data: {
      isTranscribed: true, transcriptStatus: "completed", isEmbedded: false,
      embeddingStatus: "queued", isSearchable: false, processingStatus: "queued",
    } });
    // Preserve history, using the queue's existing completed-with-error
    // convention. Old completed rows must not block a new generation either.
    await tx.processingJob.updateMany({ where: {
      episodeId: args.episodeId,
      jobType: { in: [...TRANSCRIPT_JOB_TYPES] },
      ...(args.processingJobId ? { id: { not: args.processingJobId } } : {}),
    }, data: { status: "completed", progressPercent: 0, errorMessage: SUPERSEDED_TRANSCRIPT_MESSAGE, completedAt: new Date() } });
    await tx.processingJob.create({ data: { episodeId: args.episodeId, jobType: nextJobType, status: "queued", progressPercent: 0 } });
    if (args.processingJobId) await tx.processingJob.update({ where: { id: args.processingJobId }, data: {
      status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date(),
    } });
    return count;
  }, { timeout: 30_000 });
}

async function assertEmbeddingCoverage(tx: Prisma.TransactionClient, episodeId: string) {
  const [coverage] = await tx.$queryRaw<{ total: number; embedded: number }[]>`
    SELECT count(*)::int AS total, count(transcript_embedding)::int AS embedded
    FROM transcript_segments WHERE episode_id = ${episodeId}`;
  if (!coverage || coverage.total === 0 || coverage.total !== coverage.embedded) throw new Error("Current transcript is not fully embedded");
}

export async function finishTranscriptEmbedding(db: PrismaClient, episodeId: string, expected: readonly string[], tokens: number, jobId?: string) {
  return db.$transaction(async (tx) => {
    await lockEpisode(tx, episodeId);
    await assertCurrentTranscript(tx, episodeId, expected);
    await assertEmbeddingCoverage(tx, episodeId);
    const job = jobId ? await assertCurrentJob(tx, episodeId, jobId, ["embedding"], true) : null;
    if (job?.status === "completed") return;
    await tx.episode.update({ where: { id: episodeId }, data: {
      isEmbedded: true, embeddingStatus: "completed", ...(tokens > 0 ? { embeddingTokens: tokens } : {}),
    } });
    if (jobId) {
      // Replacements supersede all prior-generation jobs under this lock.
      // Serialize lookup/create with other finishers so one current indexing
      // job serves the generation, including after a lost commit response.
      const successor = await tx.processingJob.findFirst({ where: {
        episodeId, jobType: "indexing",
        OR: [
          { status: { in: ["queued", "running", "indexing"] }, OR: [
            { errorMessage: null }, { errorMessage: { not: { startsWith: "superseded:" } } },
          ] },
          { status: "completed", errorMessage: null },
        ],
      }, select: { id: true } });
      if (!successor) await tx.processingJob.create({ data: {
        episodeId, jobType: "indexing", status: "queued", progressPercent: 0,
      } });
      await tx.processingJob.update({ where: { id: jobId }, data: {
        status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date(),
      } });
    }
  }, { timeout: 30_000 });
}

export async function publishTranscriptSearchability(db: PrismaClient, episodeId: string, jobId: string) {
  return db.$transaction(async (tx) => {
    await lockEpisode(tx, episodeId);
    const job = await assertCurrentJob(tx, episodeId, jobId, ["indexing"], true);
    const ep = await tx.episode.findUnique({ where: { id: episodeId } });
    if (!ep?.isTranscribed || !ep.isEmbedded || ep.embeddingStatus !== "completed") throw new Error("Current transcript is not ready for indexing");
    await assertEmbeddingCoverage(tx, episodeId);
    if (job.status === "completed") return;
    await tx.episode.update({ where: { id: episodeId }, data: { isSearchable: true, processingStatus: "completed" } });
    await tx.processingJob.update({ where: { id: jobId }, data: {
      status: "completed", progressPercent: 100, errorMessage: null, completedAt: new Date(),
    } });
  }, { timeout: 30_000 });
}
