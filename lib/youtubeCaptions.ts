import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TranscriptSegment, TranscriptionResult } from "./transcription";
import { runYtDlp } from "./youtube";

function parseVttTimestamp(raw: string): number {
  const ts = raw.trim().split(/\s+/)[0]!.replace(",", ".");
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  return 0;
}

const VTT_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeCaptionText(raw: string): string {
  return raw
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (m) => VTT_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * YouTube's auto-captions scroll: each cue repeats the tail of the previous one
 * so the on-screen block reads continuously. Concatenating cues verbatim
 * therefore duplicates most of the speech — measured at 1.8x on this archive,
 * or 7.6 words/second against a natural speaking rate near 2.5.
 *
 * Drop the longest run of leading words in `next` that already terminates
 * `prev`, comparing case- and punctuation-insensitively so "Word." and "word"
 * still match.
 */
function stripLeadingOverlap(prev: string[], next: string[]): string[] {
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const max = Math.min(prev.length, next.length);
  for (let k = max; k > 0; k--) {
    let same = true;
    for (let j = 0; j < k; j++) {
      if (norm(prev[prev.length - k + j]!) !== norm(next[j]!)) {
        same = false;
        break;
      }
    }
    if (same) return next.slice(k);
  }
  return next;
}

/** Parse WebVTT / YouTube auto-caption files into timed segments. */
export function parseWebVtt(content: string): TranscriptSegment[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const segments: TranscriptSegment[] = [];
  // Compare against a window of recent words, not just the last cue: rolling
  // captions can repeat across two or three cues.
  let recentWords: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line.includes("-->")) {
      const [startRaw, endRaw] = line.split("-->");
      const texts: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i]!.trim();
        if (!next) break;
        if (next.includes("-->")) break;
        if (
          next.startsWith("WEBVTT") ||
          next.startsWith("NOTE") ||
          /^\d+$/.test(next)
        ) {
          i++;
          continue;
        }
        // Inline karaoke timing tags (<00:00:11.120><c>) carry no words.
        texts.push(decodeCaptionText(next.replace(/<[^>]+>/g, "")).trim());
        i++;
      }

      const rawText = texts.join(" ").replace(/\s+/g, " ").trim();
      if (rawText) {
        const fresh = stripLeadingOverlap(recentWords, rawText.split(" "));
        const transcriptText = fresh.join(" ").trim();
        if (transcriptText) {
          recentWords = [...recentWords, ...fresh].slice(-60);
          segments.push({
            startTimeSeconds: parseVttTimestamp(startRaw!),
            endTimeSeconds: parseVttTimestamp(endRaw!),
            transcriptText,
            confidenceScore: null,
          });
        } else if (segments.length > 0) {
          // Entirely repeated cue — keep its time by extending the previous one
          // rather than emitting an empty segment.
          segments[segments.length - 1]!.endTimeSeconds = parseVttTimestamp(
            endRaw!,
          );
        }
      }
      continue;
    }
    i++;
  }

  return segments;
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

    const segments = parseWebVtt(fs.readFileSync(vttPath, "utf8"));
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
