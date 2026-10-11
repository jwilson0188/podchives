import { retryDownload, stopDownloadEpisode } from "../lib/downloadControl";
import { withActiveJob, writeJobProgress, retryJob, JobRetryError } from "../lib/jobControl";
import { PipelineJobNotActiveError } from "../lib/queueTransitions";
import { admitSourceSync, admitAudioFallback, retryAutomaticFailures } from "../lib/queueControl";
import assert from "node:assert/strict";
import { getNextQueuedJob, stopSourceSync } from "../lib/queue";
import { admitEpisodeProcessing } from "../lib/queueAdmission";
import { completeMediaPipelineJob, enqueuePipelineSuccessor, failMediaPipelineJob } from "../lib/queueTransitions";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { failTranscriptJob, finishTranscriptEmbedding, getTranscriptSegmentIds, persistTranscriptSegments, publishTranscriptSearchability, TranscriptChangedError, type SaveTranscriptArgs } from "../lib/transcriptIntegrity";

// Never fall back to DATABASE_URL / .env. Run only on an explicitly selected
// disposable DB with the existing schema + pgvector. No schema DDL or providers.
const testUrl = process.env.TRANSCRIPT_TEST_DATABASE_URL;
const disposable = process.env.TRANSCRIPT_TEST_DB_IS_DISPOSABLE === "1";

function failingClient(db: PrismaClient, delegate: string, method: string, databaseError = false): PrismaClient {
  return new Proxy(db, { get(target, property) {
    if (property === "$transaction") return <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>, options: { timeout?: number }) => db.$transaction(async (tx) => {
      const wrapped = new Proxy(tx, { get(inner, key) {
        const value = Reflect.get(inner, key);
        if (key === delegate) return new Proxy(value, { get(model, operation) {
          if (operation === method) return async (args: { data: Record<string, unknown>[] }) => {
            if (databaseError) {
              // Exercise an actual PostgreSQL foreign-key error after DELETE,
              // rather than only throwing from the transaction callback.
              return Reflect.get(model, operation).call(model, { ...args, data: args.data.map((row) => ({ ...row, episodeId: `missing-${randomUUID()}` })) });
            }
            throw new Error("Injected transaction failure");
          };
          const fn = Reflect.get(model, operation); return typeof fn === "function" ? fn.bind(model) : fn;
        } });
        return typeof value === "function" ? value.bind(inner) : value;
      } });
      return callback(wrapped);
    }, options);
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
}

test("PostgreSQL transcript integrity (explicit disposable database only)", { skip: !testUrl }, async (t) => {
  assert.ok(disposable, "Set TRANSCRIPT_TEST_DB_IS_DISPOSABLE=1 only for an explicitly disposable database");
  const db = new PrismaClient({ datasources: { db: { url: testUrl! } }, log: [] });
  try { await db.$connect(); } catch { throw new Error("Disposable integration database unavailable (connection details suppressed)"); }
  const vector = `[${Array.from({ length: 1536 }, () => 0.25).join(",")}]`;
  try {
    async function withFixture(run: (args: SaveTranscriptArgs) => Promise<void>) {
      const podcast = await db.podcast.create({ data: { name: "Transcript integrity fixture", slug: `transcript-test-${randomUUID()}` } });
      try {
        const source = await db.source.create({ data: { podcastId: podcast.id, sourceType: "youtube_video", sourceName: "Fixture", sourceUrl: "https://www.youtube.com/watch?v=fixture" } });
        const episode = await db.episode.create({ data: {
          podcastId: podcast.id, sourceId: source.id, externalId: randomUUID(), episodeTitle: "Fixture",
          sourceUrl: source.sourceUrl, sourcePlatform: "youtube", durationSeconds: 120,
          isTranscribed: true, transcriptStatus: "completed", isEmbedded: true, embeddingStatus: "completed", isSearchable: true, processingStatus: "completed", embeddingTokens: 99,
        } });
        const args: SaveTranscriptArgs = { episodeId: episode.id, podcastId: podcast.id, sourceUrl: source.sourceUrl, sourcePlatform: "youtube", transcriptSourceType: "youtube_captions", replace: true,
          segments: [{ startTimeSeconds: 1, endTimeSeconds: 4, transcriptText: "replacementmarker dialogue", confidenceScore: null }] };
        const old = await db.transcriptSegment.create({ data: {
          episodeId: episode.id, podcastId: podcast.id, sourceUrl: source.sourceUrl, sourcePlatform: "youtube", transcriptSourceType: "youtube_captions",
          startTimeSeconds: 0, endTimeSeconds: 1, transcriptText: "originalmarker dialogue",
        } });
        await db.$executeRawUnsafe("UPDATE transcript_segments SET transcript_embedding=$1::vector WHERE id=$2", vector, old.id);
        await db.processingJob.createMany({ data: ["embedding", "indexing"].map((jobType) => ({ episodeId: episode.id, jobType, status: "completed", progressPercent: 100 })) });
        await run(args);
      } finally {
        // Only this randomly named fixture's rows; no truncate, reset, migration
        // or deletion of existing archives/transcripts.
        await db.processingJob.deleteMany({ where: { source: { podcastId: podcast.id } } });
        await db.podcast.delete({ where: { id: podcast.id } });
      }
    }

    async function downloadFixture(episodeId: string, status = "failed", createdAt = new Date()) {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: episodeId } });
      return db.download.create({ data: { episodeId, sourceId: ep.sourceId, downloadType: "audio", status, createdAt } });
    }
    await t.test("download retry resolves a unique failed job and prevents duplicate admissions", () => withFixture(async (args) => {
      const dl = await downloadFixture(args.episodeId);
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed" } });
      const results = await Promise.allSettled([retryDownload(db, dl.id), retryDownload(db, dl.id)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, status: "queued" } }), 1);
      assert.match((await db.processingJob.findUniqueOrThrow({ where: { id: job.id } })).errorMessage!, /^superseded:/);
    }));
    await t.test("download retry rejects missing or ambiguous job mapping", () => withFixture(async (args) => {
      const dl = await downloadFixture(args.episodeId);
      await assert.rejects(retryDownload(db, "missing"), (err: unknown) => err instanceof JobRetryError && err.status === 404);
      await assert.rejects(retryDownload(db, dl.id), JobRetryError);
      await db.processingJob.createMany({ data: [1, 2].map(() => ({ episodeId: args.episodeId, jobType: "download", status: "failed" })) });
      const before = await snapshot(args.episodeId);
      await assert.rejects(retryDownload(db, dl.id), JobRetryError);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("historical download controls cannot affect a newer attempt", () => withFixture(async (args) => {
      const old = await downloadFixture(args.episodeId, "failed", new Date(1000));
      await downloadFixture(args.episodeId, "downloading", new Date(2000));
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(retryDownload(db, old.id), JobRetryError);
      await assert.rejects(stopDownloadEpisode(db, old.id), JobRetryError);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("download stop preserves transcript and other episodes", () => withFixture(async (args) => {
      const dl = await downloadFixture(args.episodeId, "downloading");
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const other = await db.episode.create({ data: { podcastId: ep.podcastId, sourceId: ep.sourceId, externalId: randomUUID(), episodeTitle: "Other", sourceUrl: ep.sourceUrl, sourcePlatform: "youtube" } });
      const unrelated = await db.processingJob.create({ data: { episodeId: other.id, jobType: "download", status: "queued" } });
      await db.processingJob.createMany({ data: ["download", "transcription"].map((jobType) => ({ episodeId: ep.id, jobType, status: jobType === "download" ? "downloading" : "queued" })) });
      const before = await snapshot(ep.id);
      await stopDownloadEpisode(db, dl.id);
      const after = await snapshot(ep.id);
      assert.deepEqual(after.episode, before.episode); assert.deepEqual(after.segments, before.segments);
      assert.equal(await db.processingJob.count({ where: { episodeId: ep.id, errorMessage: "Stopped by user" } }), 2);
      assert.equal((await db.processingJob.findUniqueOrThrow({ where: { id: unrelated.id } })).status, "queued");
      assert.deepEqual(await stopDownloadEpisode(db, dl.id), { stopped: true });
    }));
    await t.test("download stop failure rolls back job cancellation", () => withFixture(async (args) => {
      const dl = await downloadFixture(args.episodeId, "downloading");
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "downloading" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(stopDownloadEpisode(failingClient(db, "download", "updateMany"), dl.id), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
      assert.equal((await db.download.findUniqueOrThrow({ where: { id: dl.id } })).status, "downloading");
    }));
    await t.test("repeated stop cannot report success over manually resumed work", () => withFixture(async (args) => {
      const dl = await downloadFixture(args.episodeId, "downloading");
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "downloading" } });
      await stopDownloadEpisode(db, dl.id);
      await retryDownload(db, dl.id);
      await assert.rejects(stopDownloadEpisode(db, dl.id), JobRetryError);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, status: "queued" } }), 1);
    }));

    await t.test("stop fences running media publication, progress and successors", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const job = await db.processingJob.create({ data: { episodeId: ep.id, jobType: "download", status: "downloading" } });
      await stopSourceSync(ep.sourceId, db);
      const before = await snapshot(ep.id);
      await assert.rejects(writeJobProgress(db, job.id, { status: "downloading", progressPercent: 90 }), PipelineJobNotActiveError);
      await assert.rejects(withActiveJob(db, job.id, { episodeId: ep.id }, (tx) => tx.episode.update({ where: { id: ep.id }, data: { audioFilePath: "/late.mp3" } })), PipelineJobNotActiveError);
      await assert.rejects(completeMediaPipelineJob(db, job.id, ep.id, "download"), PipelineJobNotActiveError);
      assert.deepEqual(await snapshot(ep.id), before);
    }));
    await t.test("stop prevents source catalog publication and admission by old sync", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const job = await db.processingJob.create({ data: { sourceId: ep.sourceId, jobType: "source_sync", status: "running" } });
      await stopSourceSync(ep.sourceId, db);
      await assert.rejects(withActiveJob(db, job.id, { sourceId: ep.sourceId }, (tx) => tx.source.update({ where: { id: ep.sourceId }, data: { syncStatus: "completed" } })), PipelineJobNotActiveError);
      await assert.rejects(admitEpisodeProcessing(db, ep.id, { sourceJobId: job.id }), PipelineJobNotActiveError);
      assert.equal((await db.source.findUniqueOrThrow({ where: { id: ep.sourceId } })).syncStatus, "idle");
    }));
    await t.test("stop preserves transcript and rejects running transcription completion", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const job = await db.processingJob.create({ data: { episodeId: ep.id, jobType: "transcription", status: "transcribing" } });
      await stopSourceSync(ep.sourceId, db);
      const before = await snapshot(ep.id);
      await assert.rejects(persistTranscriptSegments(db, { ...args, processingJobId: job.id, nextJobType: "transcript_segmentation" }), TranscriptChangedError);
      await failTranscriptJob(db, ep.id, job.id, "late error");
      assert.deepEqual(await snapshot(ep.id), before);
    }));
    await t.test("explicit retry creates a fresh identity while old stopped worker stays fenced", () => withFixture(async (args) => {
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed", errorMessage: "Stopped by user", retryCount: 2 } });
      const fresh = await retryJob(db, job.id);
      assert.notEqual(fresh.id, job.id);
      assert.equal(fresh.status, "queued"); assert.equal(fresh.retryCount, 3); assert.equal(fresh.workerId, null);
      await assert.rejects(writeJobProgress(db, job.id, { status: "downloading" }), PipelineJobNotActiveError);
      await assert.rejects(retryJob(db, job.id), (err: unknown) => err instanceof JobRetryError && err.status === 409);
    }));
    await t.test("retry rejects missing, active, completed and obsolete jobs", () => withFixture(async (args) => {
      await assert.rejects(retryJob(db, "missing"), (err: unknown) => err instanceof JobRetryError && err.status === 404);
      for (const status of ["queued", "running", "completed"]) {
        const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status } });
        await assert.rejects(retryJob(db, job.id), JobRetryError);
      }
      const failed = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed" } });
      await assert.rejects(retryJob(db, failed.id), JobRetryError);
    }));
    await t.test("retry enqueue failure rolls back retired identity", () => withFixture(async (args) => {
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(retryJob(failingClient(db, "processingJob", "create"), job.id), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("concurrent explicit retries create exactly one new job", () => withFixture(async (args) => {
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed" } });
      const results = await Promise.allSettled([retryJob(db, job.id), retryJob(db, job.id)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, status: "queued" } }), 1);
    }));

    await t.test("stop racing completion leaves no runnable successor", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const job = await db.processingJob.create({ data: { episodeId: ep.id, jobType: "download", status: "downloading" } });
      const results = await Promise.allSettled([stopSourceSync(ep.sourceId, db), completeMediaPipelineJob(db, job.id, ep.id, "download")]);
      assert.equal(results[0].status, "fulfilled");
      if (results[1].status === "rejected") assert.ok(results[1].reason instanceof PipelineJobNotActiveError);
      assert.equal(await db.processingJob.count({ where: { episodeId: ep.id, status: { in: ["queued", "running", "downloading"] } } }), 0);
    }));
    await t.test("source retry keeps old sync fenced and source metadata atomic", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const job = await db.processingJob.create({ data: { sourceId: ep.sourceId, jobType: "source_sync", status: "failed", errorMessage: "Stopped by user" } });
      await assert.rejects(retryJob(failingClient(db, "source", "update"), job.id), /Injected/);
      assert.equal((await db.processingJob.findUniqueOrThrow({ where: { id: job.id } })).status, "failed");
      assert.equal(await db.processingJob.count({ where: { sourceId: ep.sourceId } }), 1);
      const fresh = await retryJob(db, job.id);
      assert.equal((await db.source.findUniqueOrThrow({ where: { id: ep.sourceId } })).syncStatus, "queued");
      assert.notEqual(fresh.id, job.id);
      await assert.rejects(withActiveJob(db, job.id, { sourceId: ep.sourceId }, async () => undefined), PipelineJobNotActiveError);
    }));

    await t.test("source sync admission deduplicates concurrent manual/automatic requests", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      await db.source.update({ where: { id: ep.sourceId }, data: { autoSync: true } });
      const results = await Promise.all([admitSourceSync(db, ep.sourceId), admitSourceSync(db, ep.sourceId, new Date())]);
      assert.equal(results.filter((r) => r?.created).length, 1);
      assert.equal(results[0]?.job.id, results[1]?.job.id);
      assert.equal((await db.source.findUniqueOrThrow({ where: { id: ep.sourceId } })).syncStatus, "queued");
    }));
    await t.test("source stop atomically cancels queued work and blocks automatic sync", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      await admitSourceSync(db, ep.sourceId);
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "queued" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(stopSourceSync(ep.sourceId, failingClient(db, "source", "update")), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
      assert.equal((await stopSourceSync(ep.sourceId, db)).cancelledJobs, 2);
      assert.equal(await admitSourceSync(db, ep.sourceId, new Date()), null);
      assert.equal((await retryAutomaticFailures(db)).count, 0);
    }));
    await t.test("automatic source admission rechecks eligibility", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      await db.source.update({ where: { id: ep.sourceId }, data: { autoSync: false } });
      assert.equal(await admitSourceSync(db, ep.sourceId, new Date()), null);
      assert.ok(await admitSourceSync(db, ep.sourceId));
    }));
    await t.test("source metadata failure rolls back job admission", () => withFixture(async (args) => {
      const ep = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const before = await db.source.findUnique({ where: { id: ep.sourceId } });
      await assert.rejects(admitSourceSync(failingClient(db, "source", "update"), ep.sourceId), /Injected/);
      assert.equal(await db.processingJob.count({ where: { sourceId: ep.sourceId } }), 0);
      assert.deepEqual(await db.source.findUnique({ where: { id: ep.sourceId } }), before);
    }));
    await t.test("audio fallback preserves existing transcript and rejects stale generations", () => withFixture(async (args) => {
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
      const before = await snapshot(args.episodeId);
      assert.equal(await admitAudioFallback(db, args.episodeId, job.id, await getTranscriptSegmentIds(db, args.episodeId), "no captions"), false);
      await assert.rejects(admitAudioFallback(db, args.episodeId, job.id, [], "no captions"), TranscriptChangedError);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("fallback failure and download admission commit together and deduplicate", () => withFixture(async (args) => {
      await db.transcriptSegment.deleteMany({ where: { episodeId: args.episodeId } });
      const jobs = await Promise.all([0, 1].map(() => db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } })));
      const results = await Promise.all(jobs.map((j) => admitAudioFallback(db, args.episodeId, j.id, [], "no captions")));
      assert.deepEqual(results.sort(), [false, true]);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, jobType: "download", status: "queued" } }), 1);
      assert.equal(await db.processingJob.count({ where: { id: { in: jobs.map((j) => j.id) }, status: "failed" } }), 2);
    }));
    await t.test("stopped fallback workers cannot enqueue or overwrite cancellation", () => withFixture(async (args) => {
      await db.transcriptSegment.deleteMany({ where: { episodeId: args.episodeId } });
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "failed", errorMessage: "Stopped by user" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(admitAudioFallback(db, args.episodeId, job.id, [], "late failure"), TranscriptChangedError);
      await failTranscriptJob(db, args.episodeId, job.id, "late failure");
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("late failure after fallback does not cancel the recovery successor", () => withFixture(async (args) => {
      await db.transcriptSegment.deleteMany({ where: { episodeId: args.episodeId } });
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
      await admitAudioFallback(db, args.episodeId, job.id, [], "no captions");
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "audio_extract", status: "queued" } });
      const before = await snapshot(args.episodeId);
      await failTranscriptJob(db, args.episodeId, job.id, "late failure");
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("fallback enqueue failure rolls back transcription failure", () => withFixture(async (args) => {
      await db.transcriptSegment.deleteMany({ where: { episodeId: args.episodeId } });
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(admitAudioFallback(failingClient(db, "processingJob", "create"), args.episodeId, job.id, [], "no captions"), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));
    await t.test("each claim observes pause and resume, excludes cancellation, and refreshes age", () => withFixture(async (args) => {
      const setting = await db.schedulerSettings.create({ data: { workerEnabled: false } });
      try {
        const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "queued", updatedAt: new Date(0) } });
        assert.equal(await getNextQueuedJob("paused", db), null);
        await db.schedulerSettings.update({ where: { id: setting.id }, data: { workerEnabled: true } });
        assert.equal((await getNextQueuedJob("resumed", db))?.id, job.id);
        assert.ok((await db.processingJob.findUniqueOrThrow({ where: { id: job.id } })).updatedAt.getTime() > 0);
        for (const errorMessage of ["Stopped by user", "cancelled: failure", "superseded: replacement"]) {
          await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "queued", errorMessage } });
        }
        assert.equal(await getNextQueuedJob("cancelled", db), null);
      } finally { await db.schedulerSettings.delete({ where: { id: setting.id } }); }
    }));
    await t.test("automatic retry preserves stopped and superseded jobs", () => withFixture(async (args) => {
      for (const errorMessage of ["Stopped by user", "cancelled: failure", "superseded: replacement", "temporary error", null]) {
        await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "failed", errorMessage } });
      }
      assert.equal((await retryAutomaticFailures(db)).count, 2);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, status: "failed" } }), 3);
    }));

    async function snapshot(episodeId: string) {
      return {
        episode: await db.episode.findUnique({ where: { id: episodeId } }),
        // Prisma cannot deserialize Unsupported("vector") in a raw SELECT *.
        segments: await db.$queryRaw`SELECT id, episode_id, podcast_id,
          start_time_seconds, end_time_seconds, transcript_text, confidence_score,
          source_url, source_platform, transcript_source_type, created_at, updated_at,
          transcript_embedding::text AS vector_text
          FROM transcript_segments WHERE episode_id=${episodeId} ORDER BY id`,
        jobs: await db.processingJob.findMany({ where: { episodeId }, orderBy: { id: "asc" } }),
      };
    }

    for (const [stage, next] of [["thumbnail_cache", "download"], ["download", "audio_extract"], ["audio_extract", "transcription"]]) {
      await t.test(`${stage} commits exactly one ${next} successor and preserves transcript state`, async () => withFixture(async (args) => {
        const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: stage, status: "running", errorMessage: "Requeued after stale timeout" } });
        const before = await snapshot(args.episodeId);
        await completeMediaPipelineJob(db, job.id, args.episodeId, stage, "groq");
        const after = await snapshot(args.episodeId);
        assert.deepEqual(after.episode, before.episode); assert.deepEqual(after.segments, before.segments);
        assert.equal(after.jobs.find((j) => j.id === job.id)?.status, "completed");
        assert.equal(after.jobs.find((j) => j.id === job.id)?.errorMessage, null);
        assert.deepEqual(after.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), [next]);
        await completeMediaPipelineJob(db, job.id, args.episodeId, stage, "groq");
        await failMediaPipelineJob(db, args.episodeId, job.id, "lost commit acknowledgment");
        assert.deepEqual(await snapshot(args.episodeId), after);
      }));
      for (const operation of ["create", "update"]) await t.test(`${stage} successor/completion ${operation} failure rolls back both sides of handoff`, async () => withFixture(async (args) => {
        const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: stage, status: "running" } });
        const before = await snapshot(args.episodeId);
        await assert.rejects(completeMediaPipelineJob(failingClient(db, "processingJob", operation), job.id, args.episodeId, stage, "groq"), /Injected/);
        assert.deepEqual(await snapshot(args.episodeId), before);
      }));
    }

    for (const mode of ["same-job", "different-jobs", "maintenance-enqueue"]) await t.test(`two real media handoff sessions contend without duplicate successors (${mode})`, async () => withFixture(async (args) => {
      const first = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "downloading" } });
      const second = mode === "different-jobs" ? await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "downloading" } }) : first;
      const workerUrl = new URL(testUrl!); workerUrl.searchParams.set("connection_limit", "1");
      const workers = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: workerUrl.toString() } }, log: [] }));
      let attempts: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        const pids = await Promise.all(workers.map(async (worker) => (await worker.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid));
        assert.notEqual(pids[0], pids[1]);
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM episodes WHERE id=${args.episodeId} FOR UPDATE`;
          attempts = Promise.allSettled([
            completeMediaPipelineJob(workers[0], first.id, args.episodeId, "download", "groq"),
            mode === "maintenance-enqueue"
              ? enqueuePipelineSuccessor(workers[1], args.episodeId, "download", "groq")
              : completeMediaPipelineJob(workers[1], second.id, args.episodeId, "download", "groq"),
          ]);
          const deadline = Date.now() + 3_000;
          let waiting = 0;
          while (Date.now() < deadline) {
            const [activity] = await tx.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid IN (${pids[0]}, ${pids[1]}) AND wait_event_type='Lock'`;
            waiting = activity.waiting;
            if (waiting === 2) break;
            await new Promise((accept) => setTimeout(accept, 20));
          }
          assert.equal(waiting, 2, "Both media handoff sessions must wait on the Episode lock");
        }, { timeout: 10_000 });
        assert.ok((await attempts!).every((result) => result.status === "fulfilled"));
        assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, jobType: "audio_extract", status: "queued" } }), 1);
        assert.equal((await db.processingJob.findUniqueOrThrow({ where: { id: first.id } })).status, "completed");
      } finally {
        await attempts;
        await Promise.all(workers.map((worker) => worker.$disconnect()));
      }
    }));

    await t.test("media failure/cancellation rollback preserves job and valid transcript", async () => withFixture(async (args) => {
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "download", status: "downloading" } });
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "audio_extract", status: "queued" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(failMediaPipelineJob(failingClient(db, "processingJob", "updateMany"), args.episodeId, job.id, "failed download"), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));

    for (const [label, changes, expected] of [
      ["caption-only", { isEmbedded: false, embeddingStatus: "queued", isSearchable: false, audioFilePath: null }, "embedding"],
      ["embedded pending search", { isSearchable: false }, "indexing"],
      ["transcript flags need validation", { isTranscribed: false, isSearchable: false }, "transcript_segmentation"],
    ] as const) await t.test(`admission resumes ${label} without touching media or transcript`, async () => withFixture(async (args) => {
      await db.episode.update({ where: { id: args.episodeId }, data: changes });
      const before = await snapshot(args.episodeId);
      const job = await admitEpisodeProcessing(db, args.episodeId, { artifactAvailable: async () => { throw new Error("Must not inspect media for saved text"); } });
      assert.equal(job?.jobType, expected);
      assert.deepEqual((await snapshot(args.episodeId)).segments, before.segments);
      assert.deepEqual((await snapshot(args.episodeId)).episode, before.episode);
      assert.equal(await admitEpisodeProcessing(db, args.episodeId), null);
    }));

    await t.test("segmentation resume with a false transcription flag is claimable by the real worker query", async () => withFixture(async (args) => {
      await db.episode.update({ where: { id: args.episodeId }, data: { isTranscribed: false, isSearchable: false } });
      const job = await admitEpisodeProcessing(db, args.episodeId);
      assert.equal(job?.jobType, "transcript_segmentation");
      const claimed = await getNextQueuedJob("fixture-worker", db);
      assert.equal(claimed?.id, job?.id);
      assert.equal(claimed?.job_type, "transcript_segmentation");
      assert.equal((await db.processingJob.findUniqueOrThrow({ where: { id: job!.id } })).status, "running");
    }));

    await t.test("source inflight pressure includes audio extraction on another episode", async () => withFixture(async (args) => {
      const ep = await db.episode.update({ where: { id: args.episodeId }, data: { isSearchable: false } });
      const other = await db.episode.create({ data: { podcastId: ep.podcastId, sourceId: ep.sourceId, externalId: randomUUID(), episodeTitle: "Inflight fixture", sourceUrl: ep.sourceUrl, sourcePlatform: ep.sourcePlatform } });
      await db.processingJob.create({ data: { episodeId: other.id, jobType: "audio_extract", status: "extracting_audio" } });
      assert.equal(await admitEpisodeProcessing(db, ep.id, { limits: { maxQueuedEpisodesPerSource: 10, maxInflightEpisodesPerSource: 1 } }), null);
    }));

    await t.test("admission rejects missing/ready/stopped episodes and recognizes extracting_audio as active", async () => withFixture(async (args) => {
      assert.equal(await admitEpisodeProcessing(db, `missing-${randomUUID()}`), null);
      assert.equal(await admitEpisodeProcessing(db, args.episodeId), null);
      await db.episode.update({ where: { id: args.episodeId }, data: { isSearchable: false } });
      const active = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "audio_extract", status: "extracting_audio" } });
      assert.equal(await admitEpisodeProcessing(db, args.episodeId), null);
      await db.processingJob.update({ where: { id: active.id }, data: { status: "failed", errorMessage: "Stopped by user" } });
      assert.equal(await admitEpisodeProcessing(db, args.episodeId), null);
    }));

    await t.test("admission checks vector coverage and resumes unfinished raw transcript segmentation", async () => withFixture(async (args) => {
      await db.$executeRawUnsafe("UPDATE transcript_segments SET transcript_embedding=NULL WHERE episode_id=$1", args.episodeId);
      const job = await admitEpisodeProcessing(db, args.episodeId);
      assert.equal(job?.jobType, "embedding");
      await db.processingJob.update({ where: { id: job!.id }, data: { status: "failed" } });
      await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "completed", errorMessage: null } });
      assert.equal((await admitEpisodeProcessing(db, args.episodeId))?.jobType, "transcript_segmentation");
    }));

    await t.test("admission recovers a missing media path and does not rewrite the stored path", async () => withFixture(async (args) => {
      await db.transcriptSegment.deleteMany({ where: { episodeId: args.episodeId } });
      await db.episode.update({ where: { id: args.episodeId }, data: { audioFilePath: "/nonexistent-podchives-fixture/audio.mp3", isSearchable: false, isTranscribed: false } });
      const before = await snapshot(args.episodeId);
      assert.equal((await admitEpisodeProcessing(db, args.episodeId, { backend: "groq" }))?.jobType, "download");
      assert.deepEqual((await snapshot(args.episodeId)).episode, before.episode);
    }));

    await t.test("failed admission create rolls back without changing text, vectors, metadata or jobs", async () => withFixture(async (args) => {
      await db.episode.update({ where: { id: args.episodeId }, data: { isSearchable: false } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(admitEpisodeProcessing(failingClient(db, "processingJob", "create"), args.episodeId), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));

    for (const sameEpisode of [true, false]) await t.test(`concurrent admission serializes ${sameEpisode ? "one episode" : "two episodes at a source cap of one"}`, async () => withFixture(async (args) => {
      await db.episode.update({ where: { id: args.episodeId }, data: { isSearchable: false } });
      const original = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      const secondId = sameEpisode ? args.episodeId : (await db.episode.create({ data: {
        podcastId: original.podcastId, sourceId: original.sourceId, externalId: randomUUID(), episodeTitle: "Second admission fixture",
        sourceUrl: original.sourceUrl, sourcePlatform: original.sourcePlatform,
      } })).id;
      const workerUrl = new URL(testUrl!); workerUrl.searchParams.set("connection_limit", "1");
      const workers = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: workerUrl.toString() } }, log: [] }));
      let attempts: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        const pids = await Promise.all(workers.map(async (worker) => (await worker.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid));
        assert.notEqual(pids[0], pids[1]);
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM sources WHERE id=${original.sourceId} FOR UPDATE`;
          const options = { limits: { maxQueuedEpisodesPerSource: 1, maxInflightEpisodesPerSource: 10 }, artifactAvailable: async () => false };
          attempts = Promise.allSettled([admitEpisodeProcessing(workers[0], args.episodeId, options), admitEpisodeProcessing(workers[1], secondId, options)]);
          const deadline = Date.now() + 3_000; let waiting = 0;
          while (Date.now() < deadline) {
            const [activity] = await tx.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid IN (${pids[0]}, ${pids[1]}) AND wait_event_type='Lock'`;
            waiting = activity.waiting; if (waiting === 2) break;
            await new Promise((accept) => setTimeout(accept, 20));
          }
          assert.equal(waiting, 2, "Both admissions must wait on the source lock");
        }, { timeout: 10_000 });
        const results = await attempts!;
        assert.ok(results.every((r) => r.status === "fulfilled"));
        assert.equal(results.filter((r) => r.status === "fulfilled" && r.value !== null).length, 1);
        assert.equal(await db.processingJob.count({ where: { episode: { sourceId: original.sourceId }, status: "queued" } }), 1);
      } finally { await attempts; await Promise.all(workers.map((worker) => worker.$disconnect())); }
    }));

    async function prepareEmbedding(args: SaveTranscriptArgs) {
      await persistTranscriptSegments(db, args);
      await db.$executeRawUnsafe("UPDATE transcript_segments SET transcript_embedding=$1::vector WHERE episode_id=$2", vector, args.episodeId);
      const job = await db.processingJob.findFirstOrThrow({ where: { episodeId: args.episodeId, jobType: "embedding", status: "queued" } });
      await db.processingJob.update({ where: { id: job.id }, data: { status: "embedding" } });
      return { jobId: job.id, ids: await getTranscriptSegmentIds(db, args.episodeId) };
    }

    for (const [delegate, operation] of [["episode", "update"], ["processingJob", "create"], ["processingJob", "update"]]) {
      await t.test(`embedding handoff ${delegate}.${operation} failure rolls back readiness/jobs and preserves vectors`, async () => withFixture(async (args) => {
        const { jobId, ids } = await prepareEmbedding(args);
        const before = await snapshot(args.episodeId);
        await assert.rejects(finishTranscriptEmbedding(failingClient(db, delegate, operation), args.episodeId, ids, 50, jobId), /Injected/);
        assert.deepEqual(await snapshot(args.episodeId), before);
      }));
    }

    await t.test("embedding handoff commits one successor, completion and metadata; repeated completion and late failure are harmless", async () => withFixture(async (args) => {
      const { jobId, ids } = await prepareEmbedding(args);
      await finishTranscriptEmbedding(db, args.episodeId, ids, 50, jobId);
      const before = await snapshot(args.episodeId);
      assert.equal(before.episode?.isEmbedded, true);
      assert.equal(before.episode?.embeddingTokens, 50);
      assert.equal(before.episode?.isSearchable, false);
      assert.equal(before.jobs.find((j) => j.id === jobId)?.status, "completed");
      assert.deepEqual(before.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), ["indexing"]);
      await finishTranscriptEmbedding(db, args.episodeId, ids, 999, jobId);
      await failTranscriptJob(db, args.episodeId, jobId, "lost commit response");
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));

    for (const sameJob of [true, false]) await t.test(`two PostgreSQL embedding finishers (${sameJob ? "same job" : "different jobs"}) contend and create exactly one indexing job`, async () => withFixture(async (args) => {
      const { jobId, ids } = await prepareEmbedding(args);
      const secondId = sameJob ? jobId : (await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "embedding", status: "embedding" } })).id;
      const workerUrl = new URL(testUrl!); workerUrl.searchParams.set("connection_limit", "1");
      const workers = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: workerUrl.toString() } }, log: [] }));
      let attempts: Promise<PromiseSettledResult<void>[]> | undefined;
      try {
        const pids = await Promise.all(workers.map(async (worker) => (await worker.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid));
        assert.notEqual(pids[0], pids[1]);
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM episodes WHERE id=${args.episodeId} FOR UPDATE`;
          attempts = Promise.allSettled([
            finishTranscriptEmbedding(workers[0], args.episodeId, ids, 50, jobId),
            finishTranscriptEmbedding(workers[1], args.episodeId, ids, 50, secondId),
          ]);
          const deadline = Date.now() + 3_000;
          let waiting = 0;
          while (Date.now() < deadline) {
            const [activity] = await tx.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid IN (${pids[0]}, ${pids[1]}) AND wait_event_type='Lock'`;
            waiting = activity.waiting;
            if (waiting === 2) break;
            await new Promise((accept) => setTimeout(accept, 20));
          }
          assert.equal(waiting, 2, "Both finishers must wait on the Episode lock");
        }, { timeout: 10_000 });
        assert.ok((await attempts!).every((result) => result.status === "fulfilled"));
        assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, jobType: "indexing", errorMessage: null } }), 1);
        assert.equal(await db.processingJob.count({ where: { id: { in: [jobId, secondId] }, status: "completed", errorMessage: null } }), sameJob ? 1 : 2);
      } finally {
        await attempts;
        await Promise.all(workers.map((worker) => worker.$disconnect()));
      }
    }));

    await t.test("reclaimed indexing job is reused and another embedding job's late failure cannot cancel it", async () => withFixture(async (args) => {
      const { jobId, ids } = await prepareEmbedding(args);
      const duplicate = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "embedding", status: "embedding" } });
      const reclaimed = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "indexing", status: "queued", errorMessage: "Requeued after stale timeout" } });
      await finishTranscriptEmbedding(db, args.episodeId, ids, 50, jobId);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, jobType: "indexing", status: "queued" } }), 1);
      const before = await db.processingJob.findUniqueOrThrow({ where: { id: reclaimed.id } });
      await failTranscriptJob(db, args.episodeId, duplicate.id, "late provider failure");
      assert.deepEqual(await db.processingJob.findUniqueOrThrow({ where: { id: reclaimed.id } }), before);
      assert.equal((await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } })).isEmbedded, true);
    }));

    await t.test("superseded embedding job cannot publish a newer complete generation or enqueue indexing", async () => withFixture(async (args) => {
      const old = await prepareEmbedding(args);
      const fresh = await prepareEmbedding(args);
      const before = await snapshot(args.episodeId);
      await assert.rejects(finishTranscriptEmbedding(db, args.episodeId, fresh.ids, 999, old.jobId), TranscriptChangedError);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));

    for (const delegate of ["episode", "processingJob"]) await t.test(`indexing ${delegate}.update failure rolls back searchable flag and job completion`, async () => withFixture(async (args) => {
      const { jobId, ids } = await prepareEmbedding(args);
      await finishTranscriptEmbedding(db, args.episodeId, ids, 50, jobId);
      const index = await db.processingJob.findFirstOrThrow({ where: { episodeId: args.episodeId, jobType: "indexing", status: "queued" } });
      await db.processingJob.update({ where: { id: index.id }, data: { status: "indexing" } });
      const before = await snapshot(args.episodeId);
      await assert.rejects(publishTranscriptSearchability(failingClient(db, delegate, "update"), args.episodeId, index.id), /Injected/);
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));

    await t.test("indexing publishes readiness and job completion together; retries and late failures preserve both", async () => withFixture(async (args) => {
      const { jobId, ids } = await prepareEmbedding(args);
      await finishTranscriptEmbedding(db, args.episodeId, ids, 50, jobId);
      const index = await db.processingJob.findFirstOrThrow({ where: { episodeId: args.episodeId, jobType: "indexing", status: "queued" } });
      await db.processingJob.update({ where: { id: index.id }, data: { status: "indexing" } });
      await publishTranscriptSearchability(db, args.episodeId, index.id);
      const before = await snapshot(args.episodeId);
      assert.equal(before.episode?.isSearchable, true);
      assert.equal(before.jobs.find((j) => j.id === index.id)?.status, "completed");
      assert.equal(before.jobs.find((j) => j.id === index.id)?.progressPercent, 100);
      await publishTranscriptSearchability(db, args.episodeId, index.id);
      await failTranscriptJob(db, args.episodeId, index.id, "lost completion acknowledgment");
      assert.deepEqual(await snapshot(args.episodeId), before);
    }));

    for (const [delegate, operation] of [["transcriptSegment", "createMany"], ["episode", "update"], ["processingJob", "updateMany"], ["processingJob", "create"], ["processingJob", "update"]]) {
      await t.test(`actual Postgres rollback after ${delegate}.${operation} failure preserves original rows/vectors/flags/jobs`, async () => withFixture(async (args) => {
        const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
        args.processingJobId = job.id; args.nextJobType = "transcript_segmentation";
        const original = await snapshot(args.episodeId);
        await assert.rejects(persistTranscriptSegments(failingClient(db, delegate, operation), args), /Injected transaction failure/);
        assert.deepEqual(await snapshot(args.episodeId), original);
      }));
    }

    await t.test("PostgreSQL foreign-key failure after deletion rolls back original text, vectors, metadata and jobs", async () => withFixture(async (args) => {
      const original = await snapshot(args.episodeId);
      await assert.rejects(persistTranscriptSegments(failingClient(db, "transcriptSegment", "createMany", true), args), { code: "P2003" });
      assert.deepEqual(await snapshot(args.episodeId), original);
    }));

    await t.test("successful replacement refreshes FTS, clears vectors and publishes consistent pending/readiness states", async () => withFixture(async (args) => {
      assert.equal(await persistTranscriptSegments(db, args), args.segments.length);
      const pending = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      assert.deepEqual({ transcribed: pending.isTranscribed, transcript: pending.transcriptStatus, embedded: pending.isEmbedded, embedding: pending.embeddingStatus, searchable: pending.isSearchable, processing: pending.processingStatus, tokens: pending.embeddingTokens },
        { transcribed: true, transcript: "completed", embedded: false, embedding: "queued", searchable: false, processing: "queued", tokens: 99 });
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, jobType: "embedding", status: "queued", errorMessage: null } }), 1);
      const [rows] = await db.$queryRaw<{ old_hits: number; new_hits: number; searchable_hits: number; vectors: number }[]>`
        SELECT count(*) FILTER (WHERE to_tsvector('english', ts.transcript_text) @@ plainto_tsquery('english', 'originalmarker'))::int AS old_hits,
        count(*) FILTER (WHERE to_tsvector('english', ts.transcript_text) @@ plainto_tsquery('english', 'replacementmarker'))::int AS new_hits,
        count(*) FILTER (WHERE e.is_searchable)::int AS searchable_hits,
        count(ts.transcript_embedding)::int AS vectors
        FROM transcript_segments ts JOIN episodes e ON e.id=ts.episode_id WHERE e.id=${args.episodeId}`;
      assert.deepEqual(rows, { old_hits: 0, new_hits: 1, searchable_hits: 0, vectors: 0 });
      const ids = await getTranscriptSegmentIds(db, args.episodeId);
      await assert.rejects(finishTranscriptEmbedding(db, args.episodeId, ids, 10), /not fully embedded/);
      await db.$executeRawUnsafe("UPDATE transcript_segments SET transcript_embedding=$1::vector WHERE episode_id=$2", vector, args.episodeId);
      await finishTranscriptEmbedding(db, args.episodeId, ids, 10);
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "indexing", status: "indexing" } });
      await publishTranscriptSearchability(db, args.episodeId, job.id);
      const ready = await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } });
      assert.deepEqual({ embedded: ready.isEmbedded, embedding: ready.embeddingStatus, searchable: ready.isSearchable, processing: ready.processingStatus, tokens: ready.embeddingTokens },
        { embedded: true, embedding: "completed", searchable: true, processing: "completed", tokens: 10 });
    }));

    await t.test("two independent workers wait on the episode lock; exactly one replaces the input generation", async () => withFixture(async (args) => {
      args.expectedSegmentIds = await getTranscriptSegmentIds(db, args.episodeId);
      const workerUrl = new URL(testUrl!); workerUrl.searchParams.set("connection_limit", "1");
      const workers = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: workerUrl.toString() } }, log: [] }));
      let attempts: Promise<PromiseSettledResult<number>[]> | undefined;
      try {
        const pids = await Promise.all(workers.map(async (worker) => (await worker.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid));
        assert.notEqual(pids[0], pids[1], "Workers must use separate PostgreSQL sessions");
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM episodes WHERE id=${args.episodeId} FOR UPDATE`;
          attempts = Promise.allSettled([
            persistTranscriptSegments(workers[0], args),
            persistTranscriptSegments(workers[1], { ...args, segments: [{ ...args.segments[0], transcriptText: "competing dialogue" }] }),
          ]);
          const deadline = Date.now() + 3_000;
          let waiting = 0;
          while (Date.now() < deadline) {
            const [activity] = await tx.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid IN (${pids[0]}, ${pids[1]}) AND wait_event_type='Lock'`;
            waiting = activity.waiting;
            if (waiting === 2) break;
            await new Promise((accept) => setTimeout(accept, 20));
          }
          assert.equal(waiting, 2, "Both worker sessions must be observed waiting for the held episode lock");
          t.diagnostic("Observed two distinct PostgreSQL worker sessions waiting on the episode lock.");
        }, { timeout: 10_000 });
        const results = await attempts!;
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const failed = results.find((r) => r.status === "rejected");
        assert.ok(failed?.status === "rejected" && failed.reason instanceof TranscriptChangedError);
        const winnerText = results[0].status === "fulfilled" ? "replacementmarker dialogue" : "competing dialogue";
        assert.deepEqual((await db.transcriptSegment.findMany({ where: { episodeId: args.episodeId } })).map((s) => s.transcriptText), [winnerText]);
        assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, status: "queued" } }), 1);
      } finally {
        await attempts;
        await Promise.all(workers.map((worker) => worker.$disconnect()));
      }
    }));

    await t.test("stale transcription, embedding and indexing completions cannot publish over a newer generation", async () => withFixture(async (args) => {
      const oldIds = await getTranscriptSegmentIds(db, args.episodeId);
      const oldTranscription = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
      const oldIndexing = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "indexing", status: "indexing" } });
      await persistTranscriptSegments(db, args);
      // A complete *new* generation must not allow an old worker to publish it.
      await db.$executeRawUnsafe("UPDATE transcript_segments SET transcript_embedding=$1::vector WHERE episode_id=$2", vector, args.episodeId);
      await finishTranscriptEmbedding(db, args.episodeId, await getTranscriptSegmentIds(db, args.episodeId), 10);
      const current = await snapshot(args.episodeId);
      await assert.rejects(persistTranscriptSegments(db, { ...args, expectedSegmentIds: oldIds, processingJobId: oldTranscription.id, nextJobType: "transcript_segmentation" }), TranscriptChangedError);
      await assert.rejects(finishTranscriptEmbedding(db, args.episodeId, oldIds, 999), TranscriptChangedError);
      await assert.rejects(publishTranscriptSearchability(db, args.episodeId, oldIndexing.id), TranscriptChangedError);
      assert.deepEqual(await snapshot(args.episodeId), current);
    }));

    await t.test("successful transcription commits metadata, job completion and exactly one segmentation successor", async () => withFixture(async (args) => {
      const job = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
      await persistTranscriptSegments(db, { ...args, processingJobId: job.id, nextJobType: "transcript_segmentation" });
      const completed = await db.processingJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(completed.status, "completed"); assert.equal(completed.progressPercent, 100); assert.equal(completed.errorMessage, null); assert.ok(completed.completedAt);
      assert.deepEqual((await db.processingJob.findMany({ where: { episodeId: args.episodeId, status: "queued" } })).map((j) => j.jobType), ["transcript_segmentation"]);
      assert.equal((await db.episode.findUniqueOrThrow({ where: { id: args.episodeId } })).isSearchable, false);
    }));

    await t.test("failure from a superseded worker preserves replacement text and fresh jobs", async () => withFixture(async (args) => {
      const oldJob = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "transcription", status: "transcribing" } });
      await persistTranscriptSegments(db, args);
      const current = await snapshot(args.episodeId);
      await assert.rejects(failTranscriptJob(db, args.episodeId, oldJob.id, "provider failed"), TranscriptChangedError);
      assert.deepEqual(await snapshot(args.episodeId), current);
    }));

    await t.test("concurrent failure and replacement always leave fresh work queued", async () => withFixture(async (args) => {
      const oldJob = await db.processingJob.create({ data: { episodeId: args.episodeId, jobType: "embedding", status: "embedding" } });
      const [replacement, failure] = await Promise.allSettled([
        persistTranscriptSegments(db, args),
        failTranscriptJob(db, args.episodeId, oldJob.id, "provider failed"),
      ]);
      assert.equal(replacement.status, "fulfilled");
      if (failure.status === "rejected") assert.ok(failure.reason instanceof TranscriptChangedError);
      assert.equal(await db.processingJob.count({ where: { episodeId: args.episodeId, jobType: "embedding", status: "queued" } }), 1);
      assert.deepEqual((await db.transcriptSegment.findMany({ where: { episodeId: args.episodeId } })).map((s) => s.transcriptText), ["replacementmarker dialogue"]);
    }));
  } finally { await db.$disconnect(); }
});
