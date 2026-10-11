import assert from "node:assert/strict";
import { test } from "node:test";
import { completeMediaPipelineJob, enqueuePipelineSuccessor, failMediaPipelineJob, PipelineJobNotActiveError, resolvePipelineSuccessor } from "../lib/queueTransitions";
import { transcriptFixture } from "./helpers/transcriptDb";

function mediaFixture(jobType = "thumbnail_cache") {
  const f = transcriptFixture();
  f.state.episodes[0].sourcePlatform = "rss";
  f.state.episodes[0].audioFilePath = null;
  f.state.episodes[0].transcriptOriginalUrl = null;
  f.state.jobs.push({ id: "media-job", episodeId: "episode", jobType, status: "running", errorMessage: null, progressPercent: 80 });
  return f;
}

test("successor planning preserves caption, feed, audio and video paths", () => {
  const ep = { sourcePlatform: "youtube", audioFilePath: null, transcriptOriginalUrl: null };
  assert.equal(resolvePipelineSuccessor(ep, "thumbnail_cache", "youtube_captions_then_groq"), "transcription");
  assert.equal(resolvePipelineSuccessor(ep, "thumbnail_cache", "groq"), "download");
  assert.equal(resolvePipelineSuccessor({ ...ep, sourcePlatform: "rss", transcriptOriginalUrl: "https://example.invalid/feed.vtt" }, "thumbnail_cache", "groq"), "transcription");
  assert.equal(resolvePipelineSuccessor({ ...ep, audioFilePath: "/fixture.MP3" }, "download", "groq"), "transcription");
  assert.equal(resolvePipelineSuccessor({ ...ep, audioFilePath: "/fixture.mp4" }, "download", "groq"), "audio_extract");
  assert.equal(resolvePipelineSuccessor(ep, "audio_extract", "groq"), "transcription");
  assert.equal(resolvePipelineSuccessor(ep, "indexing", "groq"), null);
});

for (const [stage, next] of [["thumbnail_cache", "download"], ["download", "audio_extract"], ["audio_extract", "transcription"]]) {
  test(`${stage} completion atomically queues ${next}, clears errors and is idempotent`, async () => {
    const f = mediaFixture(stage);
    f.state.jobs.find((j) => j.id === "media-job")!.errorMessage = "Requeued after stale timeout";
    const episode = structuredClone(f.state.episodes);
    const segments = structuredClone(f.state.segments);
    await completeMediaPipelineJob(f.db, "media-job", "episode", stage, "groq");
    assert.deepEqual(f.state.jobs.filter((j) => j.status === "queued").map((j) => j.jobType), [next]);
    const completed = f.state.jobs.find((j) => j.id === "media-job")!;
    assert.equal(completed.status, "completed"); assert.equal(completed.errorMessage, null); assert.equal(completed.progressPercent, 100); assert.ok(completed.completedAt);
    assert.deepEqual(f.state.episodes, episode); assert.deepEqual(f.state.segments, segments);
    const before = f.snapshot();
    await completeMediaPipelineJob(f.db, "media-job", "episode", stage, "groq");
    await failMediaPipelineJob(f.db, "episode", "media-job", "late failure");
    assert.deepEqual(f.snapshot(), before);
  });
}

for (const stage of ["thumbnail_cache", "download", "audio_extract"]) for (const step of ["enqueue", "complete", "commit"] as const) {
  test(`${stage} ${step} failure retains original predecessor and no new successor`, async () => {
    const f = mediaFixture(stage); const before = f.snapshot(); f.failAt(step);
    await assert.rejects(completeMediaPipelineJob(f.db, "media-job", "episode", stage, "groq"), /Injected/);
    assert.deepEqual(f.snapshot(), before);
  });
}

for (const status of ["queued", "failed", "completed"]) test(`a ${status} inactive/cancelled predecessor cannot publish a successor`, async () => {
  const f = mediaFixture(); const job = f.state.jobs.find((j) => j.id === "media-job")!;
  job.status = status; job.errorMessage = "cancelled: user stopped";
  const before = f.snapshot();
  await assert.rejects(completeMediaPipelineJob(f.db, "media-job", "episode", "thumbnail_cache", "groq"), PipelineJobNotActiveError);
  assert.deepEqual(f.snapshot(), before);
});

test("job attribution/type mismatch rejects without mutations", async () => {
  const f = mediaFixture(); const before = f.snapshot();
  await assert.rejects(completeMediaPipelineJob(f.db, "media-job", "episode", "download", "groq"), /match/);
  f.state.jobs.find((j) => j.id === "media-job")!.episodeId = "another-episode";
  const other = f.snapshot();
  await assert.rejects(completeMediaPipelineJob(f.db, "media-job", "episode", "thumbnail_cache", "groq"), /match/);
  assert.deepEqual(f.snapshot(), other);
  assert.deepEqual(f.state.segments, before.segments);
});

test("generic media completion cannot bypass transcript generation guards", async () => {
  const f = mediaFixture("embedding"); const before = f.snapshot();
  await assert.rejects(completeMediaPipelineJob(f.db, "media-job", "episode", "embedding", "groq"), /generation-guarded/);
  assert.deepEqual(f.snapshot(), before); assert.equal(f.transactions, 0);
});

test("reclaimed successor is reused; failed or superseded terminal rows do not block admission", async () => {
  const f = mediaFixture();
  f.state.jobs.push({ id: "reclaimed", episodeId: "episode", jobType: "download", status: "queued", errorMessage: "Requeued after stale timeout", progressPercent: 0 });
  assert.equal(await enqueuePipelineSuccessor(f.db, "episode", "thumbnail_cache", "groq"), false);
  f.state.jobs.find((j) => j.id === "reclaimed")!.status = "failed";
  f.state.jobs.push({ id: "superseded", episodeId: "episode", jobType: "download", status: "completed", errorMessage: "superseded: transcript changed", progressPercent: 0 });
  assert.equal(await enqueuePipelineSuccessor(f.db, "episode", "thumbnail_cache", "groq"), true);
  assert.equal(f.state.jobs.filter((j) => j.status === "queued").length, 1);
});

test("media failure and downstream cancellation roll back together", async () => {
  const f = mediaFixture("download");
  f.state.jobs.push({ id: "extract", episodeId: "episode", jobType: "audio_extract", status: "queued", errorMessage: null, progressPercent: 0 });
  const before = f.snapshot(); f.failAt("invalidate");
  await assert.rejects(failMediaPipelineJob(f.db, "episode", "media-job", "download error"), /Injected/);
  assert.deepEqual(f.snapshot(), before);
});
