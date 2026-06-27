import type { JobType } from "./constants";

/** Episode processing order — one job queued at a time; next step on success. */
export const EPISODE_PIPELINE: JobType[] = [
  "thumbnail_cache",
  "download",
  "audio_extract",
  "transcription",
  "transcript_segmentation",
  "embedding",
  "indexing",
];

export function isPipelineJobType(jobType: string): jobType is JobType {
  return (EPISODE_PIPELINE as string[]).includes(jobType);
}

export function getNextPipelineStep(completed: JobType): JobType | null {
  const idx = EPISODE_PIPELINE.indexOf(completed);
  if (idx === -1 || idx >= EPISODE_PIPELINE.length - 1) return null;
  return EPISODE_PIPELINE[idx + 1]!;
}

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".opus", ".flac"];

export function isAudioFilePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
