export const APP_NAME = "Podchives";
export const APP_TAGLINE = "Searchable archive for podcasts and livestream shows";

export const IS_DEMO_MODE =
  (process.env.NEXT_PUBLIC_DEMO_MODE ?? "true").toLowerCase() === "true";

export const PROCESSING_MODE = process.env.PROCESSING_MODE ?? "local";

/**
 * Provider cost model + estimation heuristics for the Usage / Compute page.
 *
 * Transcription defaults to YouTube captions (free) with Groq Whisper fallback.
 * Embeddings still use OpenAI text-embedding-3-small.
 */
export const COST_MODEL = {
  /** OpenAI Whisper API — legacy backend (TRANSCRIPTION_BACKEND=openai). */
  openaiTranscriptionUsdPerMinute: 0.006,
  /** Groq whisper-large-v3-turbo — $0.04/hr list price. */
  groqTranscriptionUsdPerMinute: 0.04 / 60,
  /** @deprecated use getTranscriptionCostPerMinute() */
  whisperUsdPerMinute: 0.04 / 60,
  /** OpenAI text-embedding-3-small — billed per 1M tokens. */
  embeddingUsdPer1MTokens: 0.02,
  /** Rough chars→tokens ratio for English text (OpenAI guidance: ~4). */
  charsPerToken: 4,
  /** ~128 kbps mono mp3 ≈ 16 KB/s. Used to estimate stored audio size. */
  audioBytesPerSecond: 16_000,
  /** Average cached thumbnail size estimate. */
  thumbnailBytesEstimate: 50_000,
  /** Fallback monthly compute budget (minutes) when no scheduler row exists. */
  defaultComputeLimitMinutes: 200,
  /** Spoken-English heuristic for embedding estimates on unprocessed episodes. */
  tokensPerSecondOfSpeech: 2.6,
  /** ± range on backfill $ estimates (duration / transcript variance). */
  backfillCostVariance: 0.12,
} as const;

export const SOURCE_TYPES = [
  "youtube_channel",
  "youtube_playlist",
  "youtube_video",
  "rss",
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
  "rss_feed",
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
