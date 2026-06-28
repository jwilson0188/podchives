/**
 * Transcription service.
 *
 * Default: try YouTube auto-captions (free), then Groq Whisper API
 * (`whisper-large-v3-turbo`). Set TRANSCRIPTION_BACKEND=openai to keep the
 * legacy OpenAI path.
 *
 * Output is normalized to { segments, fullText } regardless of backend.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import {
  getTranscriptionApiBackend,
  getTranscriptionBackend,
  getTranscriptionModel,
  shouldTryRssFeedTranscript,
  shouldTryYouTubeCaptions,
} from "./transcriptionConfig";
import { transcribeFromRssFeed } from "./rssTranscripts";
import { transcribeFromYouTubeCaptions } from "./youtubeCaptions";

/** Stay under hosted Whisper upload limits (Groq ~25 MB, OpenAI 25 MB). */
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

export type TranscriptionResolveResult = TranscriptionResult & {
  transcriptSourceType:
    | "whisper_local"
    | "whisper_api"
    | "youtube_captions"
    | "rss_feed"
    | "manual";
};

let groqClient: OpenAI | null = null;
let openaiClient: OpenAI | null = null;

function getGroqClient(): OpenAI {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set. Get a key at https://console.groq.com or set TRANSCRIPTION_BACKEND=openai.",
    );
  }
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
}

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getApiClient(): OpenAI {
  const api = getTranscriptionApiBackend();
  return api === "openai" ? getOpenAIClient() : getGroqClient();
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
  const api = getTranscriptionApiBackend();
  const c = getApiClient();
  const resp: any = await c.audio.transcriptions.create({
    file: fs.createReadStream(audioFilePath) as any,
    model: getTranscriptionModel(api),
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
 * Transcribe audio via Groq or OpenAI Whisper with verbose_json segments.
 * Files over 25 MB are split with ffmpeg and merged with corrected timestamps.
 */
export async function transcribeAudio(
  audioFilePath: string,
): Promise<TranscriptionResult> {
  if (!audioFilePath || !fs.existsSync(audioFilePath)) {
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
 * Preferred entry: free YouTube captions when available, else hosted Whisper.
 */
export async function resolveTranscription(args: {
  episodeId: string;
  audioFilePath: string;
  sourceUrl: string;
  sourcePlatform: string;
  transcriptOriginalUrl?: string | null;
}): Promise<TranscriptionResolveResult> {
  const backend = getTranscriptionBackend();

  if (shouldTryYouTubeCaptions(args.sourcePlatform, backend)) {
    try {
      const fromCaptions = await transcribeFromYouTubeCaptions(
        args.sourceUrl,
        args.episodeId,
      );
      return { ...fromCaptions, transcriptSourceType: "youtube_captions" };
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[transcription] YouTube captions unavailable for ${args.episodeId}, falling back:`,
          (err as Error).message,
        );
      }
    }
  }

  if (
    shouldTryRssFeedTranscript(
      args.transcriptOriginalUrl,
      args.sourcePlatform,
    )
  ) {
    try {
      const fromFeed = await transcribeFromRssFeed(args.transcriptOriginalUrl!);
      return { ...fromFeed, transcriptSourceType: "rss_feed" };
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[transcription] RSS feed transcript unavailable for ${args.episodeId}, falling back to API:`,
          (err as Error).message,
        );
      }
    }
  }

  if (!args.audioFilePath) {
    throw new Error(
      "No audio file for API transcription — feed transcript/captions unavailable and download may have failed",
    );
  }

  const fromApi = await transcribeAudio(args.audioFilePath);
  return { ...fromApi, transcriptSourceType: "whisper_api" };
}

/**
 * Re-segment a transcription into ~30s chunks for embedding.
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

export async function saveTranscriptSegments(args: {
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
}): Promise<number> {
  const { getDb } = await import("./db");
  const db = getDb();

  if (args.replace) {
    await db.transcriptSegment.deleteMany({
      where: { episodeId: args.episodeId },
    });
  }

  if (args.segments.length === 0) return 0;

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

/** Convenience: transcribe + segment + persist in one call. */
export async function transcribeEpisode(args: {
  episodeId: string;
  audioFilePath: string;
}): Promise<{ segmentCount: number; language: string | null }> {
  const { getDb } = await import("./db");
  const db = getDb();
  const ep = await db.episode.findUnique({ where: { id: args.episodeId } });
  if (!ep) throw new Error(`Episode ${args.episodeId} not found`);
  if (!ep.audioFilePath && !ep.sourceUrl) {
    throw new Error(`Episode ${args.episodeId} has no audio or source URL`);
  }

  const resolved = await resolveTranscription({
    episodeId: args.episodeId,
    audioFilePath: args.audioFilePath,
    sourceUrl: ep.sourceUrl,
    sourcePlatform: ep.sourcePlatform,
    transcriptOriginalUrl: ep.transcriptOriginalUrl,
  });
  const packed = segmentTranscript(resolved);

  await saveTranscriptSegments({
    episodeId: args.episodeId,
    podcastId: ep.podcastId,
    sourceUrl: ep.sourceUrl,
    sourcePlatform: ep.sourcePlatform,
    transcriptSourceType: resolved.transcriptSourceType,
    segments: packed,
    replace: true,
  });
  await markEpisodeTranscribed(args.episodeId);
  return { segmentCount: packed.length, language: resolved.language };
}
