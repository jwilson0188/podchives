/**
 * Fetch timed transcripts bundled in podcast RSS feeds (Omny, Podcast Index, etc.).
 */
import type { TranscriptionResult } from "./transcription";
import { parseWebVtt } from "./youtubeCaptions";

const FETCH_HEADERS = {
  "User-Agent": "Podchives/1.0 (+https://github.com/jwilson0188/podchives)",
  Accept: "text/vtt, application/srt, text/plain, */*",
};

function parseSrtTimestamp(raw: string): number {
  const ts = raw.trim().replace(",", ".");
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  return 0;
}

/** Parse SubRip (.srt) into the same segment shape as WebVTT. */
function parseSrt(content: string): TranscriptionResult["segments"] {
  const blocks = content.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
  const segments: TranscriptionResult["segments"] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;
    const [startRaw, endRaw] = lines[timingIdx]!.split("-->");
    const text = lines
      .slice(timingIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    segments.push({
      startTimeSeconds: parseSrtTimestamp(startRaw!),
      endTimeSeconds: parseSrtTimestamp(endRaw!),
      transcriptText: text,
      confidenceScore: null,
    });
  }

  return segments;
}

function parseFeedTranscript(content: string, url: string): TranscriptionResult {
  const trimmed = content.trim();
  const lowerUrl = url.toLowerCase();
  const segments =
    trimmed.startsWith("WEBVTT") || lowerUrl.includes("vtt")
      ? parseWebVtt(trimmed)
      : parseSrt(trimmed);

  if (segments.length === 0) {
    throw new Error("Feed transcript contained no timed segments");
  }

  return {
    fullText: segments.map((s) => s.transcriptText).join(" ").trim(),
    segments,
    language: "en",
  };
}

export async function transcribeFromRssFeed(
  transcriptUrl: string,
): Promise<TranscriptionResult> {
  const res = await fetch(transcriptUrl, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(
      `RSS feed transcript fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const content = await res.text();
  return parseFeedTranscript(content, transcriptUrl);
}
