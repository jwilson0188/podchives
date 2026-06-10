export const APP_NAME = "Podchives";
export const APP_TAGLINE = "Searchable archive for podcasts and livestream shows";

export const IS_DEMO_MODE =
  (process.env.NEXT_PUBLIC_DEMO_MODE ?? "true").toLowerCase() === "true";

export const PROCESSING_MODE = process.env.PROCESSING_MODE ?? "local";

export const SOURCE_TYPES = [
  "youtube_channel",
  "youtube_playlist",
  "youtube_video",
  "rss_future",
  "manual_upload_future",
  "patreon_future",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const JOB_TYPES = [
  "source_sync",
  "thumbnail_cache",
  "download",
  "audio_extract",
  "transcription",
  "transcript_segmentation",
  "embedding",
  "indexing",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "downloading",
  "extracting_audio",
  "transcribing",
  "segmenting",
  "embedding",
  "indexing",
  "completed",
  "failed",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TRANSCRIPT_SOURCE_TYPES = [
  "whisper_local",
  "whisper_api",
  "youtube_captions",
  "manual",
] as const;
export type TranscriptSourceType = (typeof TRANSCRIPT_SOURCE_TYPES)[number];

export const SOURCE_PLATFORMS = [
  "youtube",
  "rss",
  "manual",
  "patreon",
] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const PROCESSING_ORDER: JobType[] = [
  "thumbnail_cache",
  "download",
  "audio_extract",
  "transcription",
  "transcript_segmentation",
  "embedding",
  "indexing",
];

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "grid" },
  { label: "Search", href: "/search", icon: "search" },
  { label: "Advanced Search", href: "/advanced-search", icon: "filter" },
  { label: "Archives", href: "/archives", icon: "library" },
  { label: "Episodes", href: "/episodes", icon: "list" },
  { label: "Download Manager", href: "/download-manager", icon: "download" },
  { label: "Processing Queue", href: "/processing-queue", icon: "cpu" },
  { label: "Sources", href: "/sources", icon: "link" },
  { label: "Usage / Compute", href: "/usage", icon: "gauge" },
  { label: "Settings", href: "/settings", icon: "gear" },
] as const;
