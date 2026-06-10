/**
 * Transcription service.
 *
 * Default backend: OpenAI Whisper API (gpt-4o-transcribe / whisper-1).
 * For long audio, callers should chunk the file before invoking this.
 *
 * Output is normalized to { segments: [{ start, end, text }], fullText }
 * regardless of backend, so the segmenter and DB writer don't care.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";

/** Stay under OpenAI Whisper's 25 MB upload limit. */
const WHISPER_SAFE_BYTES = 24 * 1024 * 1024;

export type TranscriptSegment = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  transcriptText: string;
  confidenceScore: number | null;
};

export type TranscriptionResult = {
  fullText: string;
  segments: TranscriptSegment[];
  language: string | null;
};

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

type AudioChunk = { path: string; offsetSeconds: number; cleanup: boolean };

function runCommand(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) =>
      reject(new Error(`${bin} failed to start (${e.message})`)),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${bin} exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function getAudioDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read audio duration for ${filePath}`);
  }
  return duration;
}

/** Split large audio into Whisper-safe chunks; small files pass through. */
async function prepareAudioChunks(audioFilePath: string): Promise<AudioChunk[]> {
  const size = fs.statSync(audioFilePath).size;
  if (size <= WHISPER_SAFE_BYTES) {
    return [{ path: audioFilePath, offsetSeconds: 0, cleanup: false }];
  }

  const duration = await getAudioDurationSeconds(audioFilePath);
  const chunkCount = Math.ceil(size / WHISPER_SAFE_BYTES);
  const segmentTime = Math.max(60, duration / chunkCount);
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "podchives-whisper-"),
  );
  const pattern = path.join(tmpDir, "chunk_%03d.mp3");

  // Re-encode chunks — mp3 `-c copy` segment splits are often undecodable.
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    audioFilePath,
    "-f",
    "segment",
    "-segment_time",
    String(segmentTime),
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    pattern,
  ]);

  const MIN_CHUNK_BYTES = 10_000;
  const files = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort()
    .filter((f) => fs.statSync(path.join(tmpDir, f)).size >= MIN_CHUNK_BYTES);

  if (files.length === 0) {
    throw new Error(`ffmpeg produced no usable chunks for ${audioFilePath}`);
  }

  return files.map((file, index) => ({
    path: path.join(tmpDir, file),
    offsetSeconds: index * segmentTime,
    cleanup: true,
  }));
}

function cleanupChunks(chunks: AudioChunk[]) {
  const tmpDirs = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk.cleanup) continue;
    tmpDirs.add(path.dirname(chunk.path));
  }
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function transcribeAudioChunk(
  audioFilePath: string,
): Promise<TranscriptionResult> {
  const c = getClient();
  const resp: any = await c.audio.transcriptions.create({
    file: fs.createReadStream(audioFilePath) as any,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segs: TranscriptSegment[] = (resp.segments ?? []).map((s: any) => ({
    startTimeSeconds: s.start,
    endTimeSeconds: s.end,
    transcriptText: (s.text ?? "").trim(),
    confidenceScore:
      typeof s.avg_logprob === "number"
        ? Math.max(0, Math.min(1, Math.exp(s.avg_logprob)))
        : null,
  }));

  return {
    fullText: (resp.text ?? "").trim(),
    segments: segs,
    language: resp.language ?? null,
  };
}

/**
 * Transcribe an audio file via OpenAI Whisper API with verbose_json so we
 * receive timestamped segments out of the box. Files over 25 MB are split
 * with ffmpeg and merged back with corrected timestamps.
 */
export async function transcribeAudio(
  audioFilePath: string,
): Promise<TranscriptionResult> {
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`Audio file not found: ${audioFilePath}`);
  }

  const chunks = await prepareAudioChunks(audioFilePath);
  try {
    const segments: TranscriptSegment[] = [];
    const textParts: string[] = [];
    let language: string | null = null;

    for (const chunk of chunks) {
      const part = await transcribeAudioChunk(chunk.path);
      if (language == null) language = part.language;
      textParts.push(part.fullText);
      for (const s of part.segments) {
        segments.push({
          ...s,
          startTimeSeconds: s.startTimeSeconds + chunk.offsetSeconds,
          endTimeSeconds: s.endTimeSeconds + chunk.offsetSeconds,
        });
      }
    }

    return {
      fullText: textParts.join(" ").trim(),
      segments,
      language,
    };
  } finally {
    cleanupChunks(chunks);
  }
}

/**
 * Re-segment a transcription into ~30s chunks for embedding.
 * Whisper segments are already short (~5–15s); we pack adjacent ones to
 * give embeddings more context per row.
 *
 * TARGET_SECONDS controls the upper bound per segment.
 */
const TARGET_SECONDS = 30;
const HARD_MAX_SECONDS = 60;

export function segmentTranscript(
  result: TranscriptionResult,
): TranscriptSegment[] {
  if (result.segments.length === 0) return [];

  const out: TranscriptSegment[] = [];
  let cur: TranscriptSegment | null = null;

  for (const s of result.segments) {
    if (!cur) {
      cur = { ...s };
      continue;
    }
    const merged: TranscriptSegment = {
      startTimeSeconds: cur.startTimeSeconds,
      endTimeSeconds: s.endTimeSeconds,
      transcriptText: `${cur.transcriptText} ${s.transcriptText}`.trim(),
      confidenceScore:
        cur.confidenceScore != null && s.confidenceScore != null
          ? (cur.confidenceScore + s.confidenceScore) / 2
          : (cur.confidenceScore ?? s.confidenceScore ?? null),
    };
    const dur = merged.endTimeSeconds - merged.startTimeSeconds;
    const sentenceBoundary = /[.!?]\s*$/.test(cur.transcriptText);
    if (
      dur >= HARD_MAX_SECONDS ||
      (dur >= TARGET_SECONDS && sentenceBoundary)
    ) {
      out.push(cur);
      cur = { ...s };
    } else {
      cur = merged;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Persist transcript segments to the DB.
 *
 * NOTE: Embedding generation is a separate worker step. This function only
 * stores the text + timestamps. See /lib/embeddings.ts to fill the vectors.
 */
export async function saveTranscriptSegments(args: {
  episodeId: string;
  podcastId: string;
  sourceUrl: string;
  sourcePlatform: string;
  transcriptSourceType:
    | "whisper_local"
    | "whisper_api"
    | "youtube_captions"
    | "manual";
  segments: TranscriptSegment[];
  /** If true, delete any existing segments for this episode first. */
  replace?: boolean;
}): Promise<number> {
  const { getDb } = await import("./db");
  const db = getDb();

  if (args.replace) {
    await db.transcriptSegment.deleteMany({
      where: { episodeId: args.episodeId },
    });
  }

  if (args.segments.length === 0) return 0;

  // Use createMany for speed; we'll skip the embedding column entirely here
  // (it's nullable and pgvector-only).
  const result = await db.transcriptSegment.createMany({
    data: args.segments.map((s) => ({
      episodeId: args.episodeId,
      podcastId: args.podcastId,
      startTimeSeconds: s.startTimeSeconds,
      endTimeSeconds: s.endTimeSeconds,
      transcriptText: s.transcriptText,
      confidenceScore: s.confidenceScore ?? null,
      sourceUrl: args.sourceUrl,
      sourcePlatform: args.sourcePlatform,
      transcriptSourceType: args.transcriptSourceType,
    })),
  });
  return result.count;
}

/**
 * Mark an episode as transcribed once segments are persisted. Kept as a
 * separate export so workers can call it independently of the rest of the
 * pipeline (e.g. when re-running just transcription on an existing episode).
 */
export async function markEpisodeTranscribed(
  episodeId: string,
): Promise<void> {
  const { getDb } = await import("./db");
  const db = getDb();
  await db.episode.update({
    where: { id: episodeId },
    data: {
      isTranscribed: true,
      transcriptStatus: "completed",
    },
  });
}

/** Convenience: download audio + transcribe in one call. */
export async function transcribeEpisode(args: {
  episodeId: string;
  audioFilePath: string;
}): Promise<{ segmentCount: number; language: string | null }> {
  const result = await transcribeAudio(args.audioFilePath);
  const packed = segmentTranscript(result);

  const { getDb } = await import("./db");
  const db = getDb();
  const ep = await db.episode.findUnique({ where: { id: args.episodeId } });
  if (!ep) throw new Error(`Episode ${args.episodeId} not found`);

  await saveTranscriptSegments({
    episodeId: args.episodeId,
    podcastId: ep.podcastId,
    sourceUrl: ep.sourceUrl,
    sourcePlatform: ep.sourcePlatform,
    transcriptSourceType: "whisper_api",
    segments: packed,
    replace: true,
  });
  await markEpisodeTranscribed(args.episodeId);
  return { segmentCount: packed.length, language: result.language };
}
