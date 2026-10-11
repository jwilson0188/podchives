import type { PrismaClient, Prisma } from "@prisma/client";
import type { SaveTranscriptArgs } from "../../lib/transcriptIntegrity";

type Episode = {
  id: string; podcastId: string; sourceUrl: string; sourcePlatform: string;
  durationSeconds: number | null; isTranscribed: boolean; transcriptStatus: string;
  isEmbedded: boolean; embeddingStatus: string; isSearchable: boolean;
  processingStatus: string; embeddingTokens: number;
  audioFilePath?: string | null; transcriptOriginalUrl?: string | null;
};
type Segment = SaveTranscriptArgs["segments"][number] & {
  id: string; episodeId: string; podcastId: string; sourceUrl: string;
  sourcePlatform: string; transcriptSourceType: string; vector: number[] | null;
};
type Job = { id: string; episodeId: string; jobType: string; status: string; errorMessage: string | null; progressPercent: number; completedAt?: Date };
type State = { episodes: Episode[]; segments: Segment[]; jobs: Job[]; sequence: number };
type Where = { episodeId?: string; id?: string | { not: string }; jobType?: string | { in: string[] }; status?: string | { in: string[] }; errorMessage?: string | null | { not: { startsWith: string } }; OR?: Where[] };
type Failure = "delete" | "insert" | "metadata" | "invalidate" | "enqueue" | "complete" | "commit";

function matches(row: { id: string; episodeId: string; jobType?: string; status?: string; errorMessage?: string | null }, where: Where): boolean {
  return (!where.episodeId || row.episodeId === where.episodeId)
    && (!where.id || (typeof where.id === "string" ? row.id === where.id : row.id !== where.id.not))
    && (!where.status || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status!)))
    && (!where.jobType || (typeof where.jobType === "string" ? row.jobType === where.jobType : where.jobType.in.includes(row.jobType!)))
    && (where.errorMessage === undefined || (where.errorMessage && typeof where.errorMessage === "object"
      ? row.errorMessage != null && !row.errorMessage.startsWith(where.errorMessage.not.startsWith)
      : row.errorMessage === where.errorMessage))
    && (!where.OR || where.OR.some((condition) => matches(row, condition)));
}

export function transcriptFixture() {
  const episode: Episode = { id: "episode", podcastId: "podcast", sourceUrl: "https://www.youtube.com/watch?v=fixture", sourcePlatform: "youtube", durationSeconds: 120,
    isTranscribed: true, transcriptStatus: "completed", isEmbedded: true, embeddingStatus: "completed", isSearchable: true, processingStatus: "completed", embeddingTokens: 42 };
  const args: SaveTranscriptArgs = { episodeId: episode.id, podcastId: episode.podcastId, sourceUrl: episode.sourceUrl, sourcePlatform: episode.sourcePlatform, transcriptSourceType: "youtube_captions", replace: true,
    segments: [{ startTimeSeconds: 1, endTimeSeconds: 4, transcriptText: "New dialogue.", confidenceScore: null }] };
  const original: Segment = { ...args.segments[0], id: "original", episodeId: episode.id, podcastId: episode.podcastId, sourceUrl: episode.sourceUrl, sourcePlatform: episode.sourcePlatform, transcriptSourceType: "youtube_captions", transcriptText: "Original dialogue.", vector: [0.25, 0.75] };
  let state: State = { episodes: [episode], segments: [original], sequence: 0, jobs: [
    { id: "old-embedding", episodeId: episode.id, jobType: "embedding", status: "completed", errorMessage: null, progressPercent: 100 },
    { id: "old-indexing", episodeId: episode.id, jobType: "indexing", status: "completed", errorMessage: null, progressPercent: 100 },
  ] };
  let failure: Failure | undefined;
  let beforeTransaction: (() => void) | undefined;
  let transactions = 0;
  const writes: string[] = [];
  function fail(step: Failure) { writes.push(step); if (failure === step) throw new Error(`Injected ${step} failure`); }
  function delegates(get: () => State, transactional: boolean) {
    const mutate = (step: Failure) => { if (!transactional) throw new Error("Mutation outside transaction"); fail(step); };
    return {
      episode: {
        findUnique: async ({ where }: { where: { id: string } }) => structuredClone(get().episodes.find((ep) => ep.id === where.id) ?? null),
        update: async ({ where, data }: { where: { id: string }; data: Partial<Episode> }) => { mutate("metadata"); const ep = get().episodes.find((ep) => ep.id === where.id)!; Object.assign(ep, data); return ep; },
      },
      transcriptSegment: {
        findMany: async ({ where }: { where: Where }) => structuredClone(get().segments.filter((s) => matches(s, where)).sort((a, b) => a.id.localeCompare(b.id))),
        findFirst: async ({ where }: { where: Where }) => structuredClone(get().segments.filter((s) => matches(s, where)).sort((a, b) => b.startTimeSeconds - a.startTimeSeconds)[0] ?? null),
        deleteMany: async ({ where }: { where: Where }) => { mutate("delete"); const old = get().segments.length; get().segments = get().segments.filter((s) => !matches(s, where)); return { count: old - get().segments.length }; },
        createMany: async ({ data }: { data: Omit<Segment, "id" | "vector">[] }) => { mutate("insert"); data.forEach((s) => get().segments.push({ ...s, id: `new-${++get().sequence}`, vector: null })); return { count: data.length }; },
      },
      processingJob: {
        findFirst: async ({ where }: { where: Where }) => structuredClone(get().jobs.find((j) => matches(j, where)) ?? null),
        findUnique: async ({ where }: { where: { id: string } }) => structuredClone(get().jobs.find((j) => j.id === where.id) ?? null),
        updateMany: async ({ where, data }: { where: Where; data: Partial<Job> }) => { mutate("invalidate"); const jobs = get().jobs.filter((j) => matches(j, where)); jobs.forEach((j) => Object.assign(j, data)); return { count: jobs.length }; },
        create: async ({ data }: { data: Omit<Job, "id" | "errorMessage"> }) => { mutate("enqueue"); const job = { ...data, id: `job-${++get().sequence}`, errorMessage: null }; get().jobs.push(job); return job; },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Job> }) => { mutate("complete"); const job = get().jobs.find((j) => j.id === where.id)!; Object.assign(job, data); return job; },
      },
      $queryRaw: async (strings: TemplateStringsArray, episodeId: string) => {
        const sql = strings.join("?");
        if (sql.includes("FOR UPDATE")) return get().episodes.filter((e) => e.id === episodeId).map(({ id }) => ({ id }));
        if (sql.includes("count(transcript_embedding)")) { const segments = get().segments.filter((s) => s.episodeId === episodeId); return [{ total: segments.length, embedded: segments.filter((s) => s.vector !== null).length }]; }
        throw new Error("Unexpected fixture SQL");
      },
    };
  }
  const db = {
    ...delegates(() => state, false),
    $transaction: async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => {
      transactions++; beforeTransaction?.();
      const draft = structuredClone(state);
      const result = await callback(delegates(() => draft, true) as unknown as Prisma.TransactionClient);
      fail("commit"); state = draft; return result;
    },
  } as unknown as PrismaClient;
  return { args, db, writes, snapshot: () => structuredClone(state), get state() { return state; }, get transactions() { return transactions; }, failAt: (step: Failure) => { failure = step; }, beforeTransaction: (fn: () => void) => { beforeTransaction = fn; } };
}
