import assert from "node:assert/strict";
import { test } from "node:test";
import { transcriptFixture } from "./helpers/transcriptDb";
import { failTranscriptJob, finishTranscriptEmbedding, persistTranscriptSegments, publishTranscriptSearchability, SUPERSEDED_TRANSCRIPT_MESSAGE, TranscriptChangedError, TranscriptValidationError } from "../lib/transcriptIntegrity";
import { segmentTranscript } from "../lib/transcription";
import { buildFilterSql } from "../lib/searchFilters";

test("successful replacement publishes complete text, pending embeddings and a new job atomically", async () => {
  const f = transcriptFixture();
  assert.equal(await persistTranscriptSegments(f.db, f.args), 1);
  assert.deepEqual(f.state.segments.map((s) => s.transcriptText), ["New dialogue."]);
  assert.equal(f.state.segments[0].vector, null);
  assert.deepEqual(f.state.episodes[0], { ...transcriptFixture().state.episodes[0], isEmbedded: false, embeddingStatus: "queued", isSearchable: false, processingStatus: "queued" });
  assert.ok(f.state.jobs.filter((j) => j.id.startsWith("old-")).every((j) => j.errorMessage === SUPERSEDED_TRANSCRIPT_MESSAGE));
  assert.deepEqual(f.state.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), ["embedding"]);
});

const invalidCases: Array<[string, (f: ReturnType<typeof transcriptFixture>) => void]> = [
  ["empty transcript", (f) => { f.args.segments = []; }],
  ["blank text", (f) => { f.args.segments[0].transcriptText = " \n "; }],
  ["NaN start", (f) => { f.args.segments[0].startTimeSeconds = NaN; }],
  ["infinite end", (f) => { f.args.segments[0].endTimeSeconds = Infinity; }],
  ["negative start", (f) => { f.args.segments[0].startTimeSeconds = -1; }],
  ["negative end", (f) => { f.args.segments[0].endTimeSeconds = -1; }],
  ["equal times", (f) => { f.args.segments[0].endTimeSeconds = 1; }],
  ["reversed times", (f) => { f.args.segments[0].endTimeSeconds = 0; }],
  ["unordered cues", (f) => { f.args.segments.push({ ...f.args.segments[0], startTimeSeconds: 0 }); }],
  ["outside duration tolerance", (f) => { f.args.segments[0].endTimeSeconds = 122.01; }],
  ["missing required attribution", (f) => { f.args.sourcePlatform = ""; }],
  ["missing episode ID", (f) => { f.args.episodeId = ""; }],
  ["missing podcast ID", (f) => { f.args.podcastId = ""; }],
  ["invalid source URL", (f) => { f.args.sourceUrl = "file:///fixture"; }],
  ["invalid transcript source type", (f) => { f.args.transcriptSourceType = "invalid" as typeof f.args.transcriptSourceType; }],
  ["wrong podcast", (f) => { f.args.podcastId = "other-podcast"; }],
  ["wrong source URL", (f) => { f.args.sourceUrl = "https://example.invalid/other"; }],
  ["wrong platform", (f) => { f.args.sourcePlatform = "rss"; }],
  ["invalid confidence", (f) => { f.args.segments[0].confidenceScore = NaN; }],
  ["missing episode", (f) => { f.state.episodes = []; }],
  ["invalid episode duration", (f) => { f.state.episodes[0].durationSeconds = 0; }],
];
for (const [label, mutate] of invalidCases) test(`rejects ${label} before mutation, preserving original transcript/vectors/readiness/jobs`, async () => {
  const f = transcriptFixture(); mutate(f); const original = f.snapshot();
  await assert.rejects(persistTranscriptSegments(f.db, f.args), TranscriptValidationError);
  assert.equal(f.transactions, 0); assert.deepEqual(f.writes, []); assert.deepEqual(f.snapshot(), original);
});

for (const step of ["delete", "insert", "metadata", "invalidate", "enqueue", "complete", "commit"] as const) test(`injected ${step} failure rolls back transcript, embeddings, metadata and jobs`, async () => {
  const f = transcriptFixture();
  f.args.processingJobId = "transcribing"; f.args.nextJobType = "transcript_segmentation";
  f.state.jobs.push({ id: "transcribing", episodeId: "episode", jobType: "transcription", status: "transcribing", errorMessage: null, progressPercent: 80 });
  const original = f.snapshot(); f.failAt(step);
  await assert.rejects(persistTranscriptSegments(f.db, f.args), new RegExp(`Injected ${step} failure`));
  assert.deepEqual(f.snapshot(), original);
});

test("legitimate repeated dialogue and fractional overlapping cues are preserved verbatim", async () => {
  const f = transcriptFixture();
  f.args.segments = [
    { startTimeSeconds: 0, endTimeSeconds: 1.5, transcriptText: "Thank you.", confidenceScore: null },
    { startTimeSeconds: 1.25, endTimeSeconds: 2.5, transcriptText: "Thank you.", confidenceScore: 0.8 },
    { startTimeSeconds: 100, endTimeSeconds: 101, transcriptText: "Thank you.", confidenceScore: null },
  ];
  await persistTranscriptSegments(f.db, f.args);
  assert.deepEqual(f.state.segments.map(({ startTimeSeconds, endTimeSeconds, transcriptText, confidenceScore }) => ({ startTimeSeconds, endTimeSeconds, transcriptText, confidenceScore })), f.args.segments);
});

test("duration accepts exactly 2s overshoot, unknown duration has no artificial cap", async () => {
  for (const duration of [120, null]) { const f = transcriptFixture(); f.state.episodes[0].durationSeconds = duration; f.args.segments[0].endTimeSeconds = duration === null ? 10_000 : 122; await persistTranscriptSegments(f.db, f.args); }
});

test("source metadata is revalidated under the episode lock", async () => {
  const f = transcriptFixture(); f.beforeTransaction(() => { f.state.episodes[0].durationSeconds = 1; }); f.args.segments[0].endTimeSeconds = 4;
  await assert.rejects(persistTranscriptSegments(f.db, f.args), TranscriptValidationError);
  assert.deepEqual(f.writes, []); assert.equal(f.state.segments[0].id, "original");
});

test("stale transcription/segmentation snapshot cannot replace a newer transcript", async () => {
  const f = transcriptFixture(); f.args.expectedSegmentIds = ["previous-generation"];
  const original = f.snapshot(); await assert.rejects(persistTranscriptSegments(f.db, f.args), TranscriptChangedError); assert.deepEqual(f.snapshot(), original);
});

test("successful worker replacement completes current job and queues segmentation inside transaction", async () => {
  const f = transcriptFixture(); f.args.processingJobId = "transcribing"; f.args.nextJobType = "transcript_segmentation";
  f.state.jobs.push({ id: "transcribing", episodeId: "episode", jobType: "transcription", status: "transcribing", progressPercent: 80, errorMessage: null });
  await persistTranscriptSegments(f.db, f.args);
  const job = f.state.jobs.find((j) => j.id === "transcribing")!;
  assert.equal(job.status, "completed"); assert.equal(job.progressPercent, 100); assert.equal(job.errorMessage, null);
  assert.deepEqual(f.state.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), ["transcript_segmentation"]);
});

test("input dataset is copied before async DB work", async () => {
  const f = transcriptFixture(); const operation = persistTranscriptSegments(f.db, f.args);
  f.args.segments[0].transcriptText = "Changed while awaiting DB"; f.args.segments[0].endTimeSeconds = NaN;
  await operation; assert.equal(f.state.segments[0].transcriptText, "New dialogue."); assert.equal(f.state.segments[0].endTimeSeconds, 4);
});

test("append preserves old transcript but invalidates partial semantic readiness", async () => {
  const f = transcriptFixture(); f.args.replace = false; f.args.segments[0].startTimeSeconds = 5; f.args.segments[0].endTimeSeconds = 6;
  await persistTranscriptSegments(f.db, f.args);
  assert.equal(f.state.segments[0].id, "original"); assert.deepEqual(f.state.segments[0].vector, [0.25, 0.75]);
  assert.equal(f.state.segments.length, 2); assert.equal(f.state.episodes[0].isEmbedded, false); assert.equal(f.state.episodes[0].isSearchable, false);
});

test("replacement preserves another episode's transcript, vectors, flags and jobs", async () => {
  const f = transcriptFixture();
  const episode = { ...f.state.episodes[0], id: "unrelated-episode" };
  const segment = { ...f.state.segments[0], id: "unrelated-segment", episodeId: episode.id };
  const job = { ...f.state.jobs[0], id: "unrelated-job", episodeId: episode.id };
  f.state.episodes.push(episode); f.state.segments.push(segment); f.state.jobs.push(job);
  await persistTranscriptSegments(f.db, f.args);
  assert.deepEqual(f.state.episodes.find((e) => e.id === episode.id), episode);
  assert.deepEqual(f.state.segments.find((s) => s.id === segment.id), segment);
  assert.deepEqual(f.state.jobs.find((j) => j.id === job.id), job);
});

test("out-of-order append is rejected before any mutation", async () => {
  const f = transcriptFixture(); f.args.replace = false; f.args.segments[0].startTimeSeconds = 0;
  const original = f.snapshot();
  await assert.rejects(persistTranscriptSegments(f.db, f.args), TranscriptValidationError);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.snapshot(), original);
});

test("stale embedding worker cannot mark newer segments embedded", async () => {
  const f = transcriptFixture(); await persistTranscriptSegments(f.db, f.args); const original = f.snapshot();
  await assert.rejects(finishTranscriptEmbedding(f.db, "episode", ["original"], 100), TranscriptChangedError); assert.deepEqual(f.snapshot(), original);
});

test("old worker failure observed after replacement cannot cancel fresh queued jobs", async () => {
  const f = transcriptFixture();
  await persistTranscriptSegments(f.db, f.args); const original = f.snapshot();
  await assert.rejects(failTranscriptJob(f.db, "episode", "old-embedding", "provider failed"), TranscriptChangedError);
  assert.deepEqual(f.snapshot(), original); assert.deepEqual(f.state.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), ["embedding"]);
});

test("current embedding failure preserves valid text/vectors and pending readiness", async () => {
  const f = transcriptFixture(); await persistTranscriptSegments(f.db, f.args);
  const job = f.state.jobs.find((j) => j.status === "queued")!; job.status = "embedding";
  f.state.jobs.push({ ...job, id: "queued-index", jobType: "indexing", status: "queued" });
  const segments = structuredClone(f.state.segments); const episode = structuredClone(f.state.episodes[0]);
  await failTranscriptJob(f.db, "episode", job.id, "provider failed");
  assert.deepEqual(f.state.segments, segments); assert.deepEqual(f.state.episodes[0], episode);
  assert.equal(f.state.jobs.find((j) => j.id === job.id)?.status, "failed");
  assert.equal(f.state.jobs.find((j) => j.id === "queued-index")?.errorMessage, "cancelled: embedding failed");
});

test("new replacement supersedes an older running transcription as well as downstream work", async () => {
  const f = transcriptFixture();
  f.state.jobs.push({ id: "older-transcription", episodeId: "episode", jobType: "transcription", status: "transcribing", progressPercent: 80, errorMessage: null });
  await persistTranscriptSegments(f.db, f.args);
  const original = f.snapshot();
  await assert.rejects(failTranscriptJob(f.db, "episode", "older-transcription", "write failed"), TranscriptChangedError);
  assert.deepEqual(f.snapshot(), original);
});

test("embedding readiness requires complete current vector coverage", async () => {
  const f = transcriptFixture(); await persistTranscriptSegments(f.db, f.args); const ids = f.state.segments.map((s) => s.id);
  await assert.rejects(finishTranscriptEmbedding(f.db, "episode", ids, 100), /not fully embedded/);
  assert.equal(f.state.episodes[0].isEmbedded, false);
  f.state.segments.forEach((s) => { s.vector = [1, 2]; }); await finishTranscriptEmbedding(f.db, "episode", ids, 100);
  assert.equal(f.state.episodes[0].isEmbedded, true); assert.equal(f.state.episodes[0].isSearchable, false); assert.equal(f.state.episodes[0].embeddingTokens, 100);
});

test("superseded index job cannot republish searchable status", async () => {
  const f = transcriptFixture(); await persistTranscriptSegments(f.db, f.args);
  await assert.rejects(publishTranscriptSearchability(f.db, "episode", "old-indexing"), TranscriptChangedError);
  assert.equal(f.state.episodes[0].isSearchable, false);
});

test("indexing requires current embedding flags and complete vector coverage", async () => {
  const f = transcriptFixture(); await persistTranscriptSegments(f.db, f.args);
  f.state.jobs.push({ id: "current-index", episodeId: "episode", jobType: "indexing", status: "indexing", progressPercent: 50, errorMessage: null });
  await assert.rejects(publishTranscriptSearchability(f.db, "episode", "current-index"), /not ready/);
  f.state.episodes[0].isEmbedded = true; f.state.episodes[0].embeddingStatus = "completed";
  await assert.rejects(publishTranscriptSearchability(f.db, "episode", "current-index"), /not fully embedded/);
  f.state.segments.forEach((s) => { s.vector = [1, 2]; }); await publishTranscriptSearchability(f.db, "episode", "current-index");
  assert.equal(f.state.episodes[0].isSearchable, true);
});

test("default FTS retrieval excludes pending episodes", () => { assert.match(buildFilterSql({}, 1).sql, /e\.is_searchable = true/); });

test("packing does not dedupe dialogue or shorten nested cue boundaries", () => {
  const packed = segmentTranscript({ fullText: "Yes. Yes.", language: "en", segments: [
    { startTimeSeconds: 0, endTimeSeconds: 10, transcriptText: "Yes.", confidenceScore: null },
    { startTimeSeconds: 1, endTimeSeconds: 2, transcriptText: "Yes.", confidenceScore: null },
  ] });
  assert.equal(packed[0].transcriptText, "Yes. Yes."); assert.equal(packed[0].endTimeSeconds, 10);
});

async function embeddingHandoffFixture() {
  const f = transcriptFixture();
  await persistTranscriptSegments(f.db, f.args);
  f.state.segments.forEach((s) => { s.vector = [1, 2]; });
  const job = f.state.jobs.find((j) => j.status === "queued")!;
  job.status = "embedding";
  return { f, jobId: job.id, ids: f.state.segments.map((s) => s.id) };
}

test("embedding completion commits metadata, job success and one indexing successor; retry is a no-op", async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId);
  const completed = f.snapshot();
  assert.equal(f.state.episodes[0].isEmbedded, true);
  assert.equal(f.state.episodes[0].isSearchable, false);
  assert.equal(f.state.jobs.find((j) => j.id === jobId)?.status, "completed");
  assert.deepEqual(f.state.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), ["indexing"]);
  await finishTranscriptEmbedding(f.db, "episode", ids, 999, jobId);
  assert.deepEqual(f.snapshot(), completed);
});

for (const step of ["metadata", "enqueue", "complete", "commit"] as const) test(`embedding ${step} failure rolls back readiness and jobs while retaining valid vectors`, async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture(); const before = f.snapshot(); f.failAt(step);
  await assert.rejects(finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId), /Injected/);
  assert.deepEqual(f.snapshot(), before);
});

for (const status of ["queued", "running", "indexing", "completed"]) test(`embedding completion reuses a current ${status} indexing job`, async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  f.state.jobs.push({ id: "existing-index", episodeId: "episode", jobType: "indexing", status, progressPercent: 0, errorMessage: null });
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId);
  assert.equal(f.state.jobs.filter((j) => j.jobType === "indexing" && j.errorMessage === null).length, 1);
});

test("superseded embedding job cannot finish even with the new generation's segment IDs", async () => {
  const { f, ids } = await embeddingHandoffFixture(); const before = f.snapshot();
  await assert.rejects(finishTranscriptEmbedding(f.db, "episode", ids, 100, "old-embedding"), TranscriptChangedError);
  assert.deepEqual(f.snapshot(), before);
});

test("a duplicate worker's late failure cannot cancel a committed indexing successor", async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId); const before = f.snapshot();
  await failTranscriptJob(f.db, "episode", jobId, "lost commit response");
  assert.deepEqual(f.snapshot(), before);
});

for (const step of ["metadata", "complete", "commit"] as const) test(`indexing ${step} failure rolls back search publication and job completion`, async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId);
  const indexing = f.state.jobs.find((j) => j.status === "queued")!; indexing.status = "indexing";
  const before = f.snapshot(); f.failAt(step);
  await assert.rejects(publishTranscriptSearchability(f.db, "episode", indexing.id), /Injected/);
  assert.deepEqual(f.snapshot(), before);
});

test("indexing success and readiness commit together; duplicate completion/failure preserve success", async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId);
  const indexing = f.state.jobs.find((j) => j.status === "queued")!; indexing.status = "indexing";
  await publishTranscriptSearchability(f.db, "episode", indexing.id);
  assert.equal(f.state.episodes[0].isSearchable, true);
  assert.equal(f.state.jobs.find((j) => j.id === indexing.id)?.progressPercent, 100);
  assert.equal(f.state.jobs.find((j) => j.id === indexing.id)?.status, "completed");
  const before = f.snapshot();
  await publishTranscriptSearchability(f.db, "episode", indexing.id);
  await failTranscriptJob(f.db, "episode", indexing.id, "late failure");
  assert.deepEqual(f.snapshot(), before);
});

test("reclaimed indexing job with a diagnostic message is reused, not duplicated", async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  f.state.jobs.push({ id: "reclaimed", episodeId: "episode", jobType: "indexing", status: "queued", progressPercent: 0, errorMessage: "Requeued after stale timeout" });
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId);
  assert.deepEqual(f.state.jobs.filter((j) => j.status === "queued").map((j) => j.id), ["reclaimed"]);
});

test("a different embedding job's late failure preserves the published generation's indexing work", async () => {
  const { f, jobId, ids } = await embeddingHandoffFixture();
  f.state.jobs.push({ id: "duplicate-embedding", episodeId: "episode", jobType: "embedding", status: "embedding", progressPercent: 10, errorMessage: null });
  await finishTranscriptEmbedding(f.db, "episode", ids, 100, jobId);
  const before = f.snapshot();
  await failTranscriptJob(f.db, "episode", "duplicate-embedding", "provider failed");
  assert.deepEqual(f.state.episodes, before.episodes);
  assert.deepEqual(f.state.segments, before.segments);
  assert.deepEqual(f.state.jobs.filter((j) => j.jobType === "indexing"), before.jobs.filter((j) => j.jobType === "indexing"));
  assert.equal(f.state.jobs.find((j) => j.id === "duplicate-embedding")?.status, "failed");
});
