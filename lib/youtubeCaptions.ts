import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TranscriptSegment, TranscriptionResult } from "./transcription";
import { runYtDlp } from "./youtube";

function parseVttTimestamp(raw: string): number {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(raw.replace(",", "."));
  if (!match) throw new Error("Invalid WebVTT timestamp");
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  if (!Number.isFinite(seconds)) throw new Error("Invalid WebVTT timestamp");
  return seconds;
}

const VTT_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '\"', "&apos;": "'", "&nbsp;": " ",
};

function decodeCaptionText(raw: string): string {
  // Decode once: an escaped entity must not become a second executable decode.
  return raw.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    if (VTT_ENTITIES[entity]) return VTT_ENTITIES[entity];
    if (!entity.startsWith("&#")) return entity;
    const value = /^&#x/i.test(entity) ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value) : "\uFFFD";
  });
}

function captionText(raw: string): string {
  return decodeCaptionText(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Keep untimed speech verbatim. YouTube rolling dedup is opt-in and only removes
 * identical spans with explicit inline timing, identical start/end/text and
 * overlapping source cue windows. Text similarity alone is not evidence that
 * speech is duplicated. Never stretch an earlier cue to cover a repeated one.
 */
export function parseWebVtt(
  content: string,
  { deduplicateRolling = false }: { deduplicateRolling?: boolean } = {},
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let previousStart = -1;
  // Only retain identities while their source cue could overlap the next cue.
  const activeSpans = new Map<string, number>();
  const blocks = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    if (/^(?:NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[0] ?? "")) continue;
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[timingIndex]!);
    if (!timing) throw new Error("Invalid WebVTT cue timing");
    const start = parseVttTimestamp(timing[1]!);
    const end = parseVttTimestamp(timing[2]!);
    if (end <= start || start < previousStart) throw new Error("Invalid WebVTT cue range/order");
    previousStart = start;
    for (const [key, cueEnd] of activeSpans) if (cueEnd <= start) activeSpans.delete(key);

    const raw = lines.slice(timingIndex + 1).join(" ");
    const parts: Array<{ start: number; end: number; raw: string; explicit: boolean }> = [];
    let cursor = 0;
    let partStart = start;
    let explicit = false;
    // Numeric tags are inline timestamps, not text/formatting tags.
    for (const tag of raw.matchAll(/<(\d[^>]*)>/g)) {
      const time = parseVttTimestamp(tag[1]!);
      if (time < partStart || (explicit && time === partStart) || time > end) {
        throw new Error("Invalid WebVTT inline timestamp order/range");
      }
      parts.push({ start: partStart, end: time, raw: raw.slice(cursor, tag.index), explicit });
      partStart = time;
      explicit = true;
      cursor = tag.index! + tag[0].length;
    }
    parts.push({ start: partStart, end, raw: raw.slice(cursor), explicit });
    // Timing tags can occur inside a word (or before attached punctuation).
    // Downstream packing joins segments with spaces: keep such a cue whole
    // rather than inventing a word boundary or guessing its timing.
    const plainParts = parts.map((part) => decodeCaptionText(part.raw.replace(/<[^>]+>/g, "")));
    const splitsText = plainParts.some((text, index) =>
      index > 0 && /\S$/.test(plainParts[index - 1]!) && /^\S/.test(text),
    );
    if (splitsText) {
      const text = captionText(raw);
      if (text) segments.push({
        startTimeSeconds: start, endTimeSeconds: end,
        transcriptText: text, confidenceScore: null,
      });
      continue;
    }
    const currentSpans = new Map<string, number>();
    for (const part of parts) {
      const text = captionText(part.raw);
      if (!text) continue;
      if (part.end <= part.start) throw new Error("WebVTT text has an empty time range");
      const key = JSON.stringify([part.start, part.end, text]);
      const repeated = deduplicateRolling && part.explicit && activeSpans.has(key);
      if (deduplicateRolling && part.explicit) currentSpans.set(key, end);
      if (!repeated) segments.push({
        startTimeSeconds: part.start, endTimeSeconds: part.end,
        transcriptText: text, confidenceScore: null,
      });
    }
    for (const [key, cueEnd] of currentSpans) activeSpans.set(key, Math.max(activeSpans.get(key) ?? 0, cueEnd));
  }
  // Inline spans from overlapping cues can interleave even when cues are ordered.
  return segments.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}

function findVttFile(dir: string, episodeId: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(episodeId) && f.endsWith(".vtt"))
    .map((f) => path.join(dir, f))
    .sort();
  return candidates[0] ?? null;
}

/**
 * Download English auto-captions via yt-dlp (no audio). Free on most YouTube
 * uploads; quality is good enough for search.
 */
export async function transcribeFromYouTubeCaptions(
  sourceUrl: string,
  episodeId: string,
): Promise<TranscriptionResult> {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `podchives-captions-${episodeId}-`),
  );

  try {
    await runYtDlp([
      "--write-auto-sub",
      "--write-sub",
      "--sub-langs",
      "en,en-US,en-GB,en.*",
      "--convert-subs",
      "vtt",
      "--skip-download",
      "-o",
      path.join(tmpDir, episodeId),
      sourceUrl,
    ]);

    const vttPath = findVttFile(tmpDir, episodeId);
    if (!vttPath) {
      throw new Error("No English captions available for this video");
    }

    const segments = parseWebVtt(fs.readFileSync(vttPath, "utf8"), { deduplicateRolling: true });
    if (segments.length === 0) {
      throw new Error("Caption file was empty after parsing");
    }

    return {
      fullText: segments.map((s) => s.transcriptText).join(" ").trim(),
      segments,
      language: "en",
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
