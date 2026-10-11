import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasUsableLocalFile } from "../lib/mediaArtifacts";
import { planEpisodeResume, type ResumeEvidence } from "../lib/queueAdmission";

const episode = {
  isSearchable: false, isTranscribed: false, isEmbedded: false,
  transcriptStatus: "queued", embeddingStatus: "queued", audioFilePath: null as string | null,
  thumbnailOriginalUrl: null as string | null, sourcePlatform: "youtube", transcriptOriginalUrl: null as string | null,
};
const evidence: ResumeEvidence = { segments: 0, embedded: 0, needsSegmentation: false, audioAvailable: false, thumbnailAvailable: false, transcriptionFailed: false };
const transcribed = { ...episode, isTranscribed: true, transcriptStatus: "completed" };

test("caption-only transcript resumes embedding without media", () => {
  assert.equal(planEpisodeResume(transcribed, { ...evidence, segments: 2 }, "groq"), "embedding");
});
test("fully embedded transcript resumes indexing; a ready archive needs no work", () => {
  const ep = { ...transcribed, isEmbedded: true, embeddingStatus: "completed" };
  assert.equal(planEpisodeResume(ep, { ...evidence, segments: 2, embedded: 2 }, "groq"), "indexing");
  assert.equal(planEpisodeResume({ ...ep, isSearchable: true }, { ...evidence, segments: 2, embedded: 2 }, "groq"), null);
});
test("partial vector coverage is not mistaken for complete readiness", () => {
  assert.equal(planEpisodeResume({ ...transcribed, isEmbedded: true, embeddingStatus: "completed", isSearchable: true }, { ...evidence, segments: 2, embedded: 1 }, "groq"), "embedding");
});
test("raw transcript or inconsistent transcript flags resume validation/segmentation", () => {
  assert.equal(planEpisodeResume(transcribed, { ...evidence, segments: 2, needsSegmentation: true }, "groq"), "transcript_segmentation");
  assert.equal(planEpisodeResume(episode, { ...evidence, segments: 2 }, "groq"), "transcript_segmentation");
});
test("usable audio resumes transcription and usable video resumes extraction", () => {
  assert.equal(planEpisodeResume({ ...episode, audioFilePath: "/media.MP3" }, { ...evidence, audioAvailable: true }, "groq"), "transcription");
  assert.equal(planEpisodeResume({ ...episode, audioFilePath: "/media.mp4" }, { ...evidence, audioAvailable: true }, "groq"), "audio_extract");
});
test("stale audio paths do not prevent download or free caption recovery", () => {
  assert.equal(planEpisodeResume({ ...episode, audioFilePath: "/gone.mp3" }, evidence, "groq"), "download");
  assert.equal(planEpisodeResume({ ...episode, audioFilePath: "/gone.mp3" }, evidence, "youtube_captions_then_groq"), "transcription");
});
test("failed cheap transcription resumes download rather than repeating a dead caption loop", () => {
  assert.equal(planEpisodeResume(episode, { ...evidence, transcriptionFailed: true }, "youtube_captions_then_groq"), "download");
});
test("RSS transcript and initial thumbnail bypass rules remain intact", () => {
  assert.equal(planEpisodeResume({ ...episode, sourcePlatform: "rss", transcriptOriginalUrl: "https://example.invalid/feed.vtt" }, evidence, "groq"), "transcription");
  assert.equal(planEpisodeResume({ ...episode, thumbnailOriginalUrl: "https://example.invalid/image.jpg" }, evidence, "youtube_captions_then_groq"), "thumbnail_cache");
});
test("a searchable flag without any transcript rows does not mask missing data", () => {
  assert.equal(planEpisodeResume({ ...episode, isSearchable: true }, evidence, "groq"), "download");
});
test("media inspection requires a readable nonempty regular file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "podchives-artifact-test-"));
  try {
    const empty = join(dir, "empty.mp3"); const audio = join(dir, "audio.mp3");
    await writeFile(empty, ""); await writeFile(audio, "fixture bytes, no codec validation");
    assert.equal(await hasUsableLocalFile(null), false);
    assert.equal(await hasUsableLocalFile(join(dir, "missing.mp3")), false);
    assert.equal(await hasUsableLocalFile(dir), false);
    assert.equal(await hasUsableLocalFile(empty), false);
    assert.equal(await hasUsableLocalFile(audio), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
