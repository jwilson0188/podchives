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

/** Parse WebVTT / YouTube auto-caption files into timed segments. */
export function parseWebVtt(content: string): TranscriptSegment[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const segments: TranscriptSegment[] = [];
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
        texts.push(next.replace(/<[^>]+>/g, "").trim());
        i++;
      }
      const transcriptText = texts.join(" ").replace(/\s+/g, " ").trim();
      if (transcriptText) {
        segments.push({
          startTimeSeconds: parseVttTimestamp(startRaw!),
          endTimeSeconds: parseVttTimestamp(endRaw!),
          transcriptText,
          confidenceScore: null,
        });
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
