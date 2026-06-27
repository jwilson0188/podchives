import type {
  JobStatus,
  JobType,
  SourcePlatform,
  SourceType,
  TranscriptSourceType,
} from "./constants";

export type DemoPodcast = {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  officialUrl: string;
  episodeCount: number;
  searchableCount: number;
  lastSyncedAt: string;
};

export type DemoSource = {
  id: string;
  podcastId: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string;
  authRequired: boolean;
  autoSync: boolean;
  lastSyncedAt: string | null;
  syncStatus: "idle" | "syncing" | "error" | "completed";
  episodesFound: number;
};

export type DemoEpisode = {
  id: string;
  podcastId: string;
  sourceId: string;
  externalId: string;
  episodeTitle: string;
  episodeNumber: number | null;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  publishDate: string;
  durationSeconds: number;
  thumbnailUrl: string;
  transcriptStatus: JobStatus;
  embeddingStatus: JobStatus;
  processingStatus: JobStatus;
  isSearchable: boolean;
  isTranscribed: boolean;
  isEmbedded: boolean;
};

export type DemoTranscriptSegment = {
  id: string;
  episodeId: string;
  podcastId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  transcriptText: string;
  confidenceScore: number;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  transcriptSourceType: TranscriptSourceType;
};

export type DemoProcessingJob = {
  id: string;
  episodeId: string;
  episodeTitle: string;
  podcastName: string;
  jobType: JobType;
  status: JobStatus;
  progressPercent: number;
  workerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
};

export type DemoDownload = {
  id: string;
  episodeId: string;
  episodeTitle: string;
  podcastName: string;
  downloadType: "audio" | "video" | "thumbnail";
  status: JobStatus;
  progressPercent: number;
  filePath: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

export type DemoSearchResult = {
  id: string;
  podcastId: string;
  podcastName: string;
  episodeId: string;
  episodeTitle: string;
  episodeNumber: number | null;
  publishDate: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  transcriptText: string;
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  relevanceScore: number;
  thumbnailUrl: string;
};

export type DemoSearchHistory = {
  id: string;
  queryText: string;
  filtersUsed: string;
  resultCount: number;
  createdAt: string;
};

export const demoPodcast: DemoPodcast = {
  id: "pod_1",
  name: "The Roundtable",
  slug: "the-roundtable",
  description:
    "Long-form interviews and livestreams about technology, media, and the people building both.",
  coverImageUrl:
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  officialUrl: "https://www.youtube.com/@theroundtable",
  episodeCount: 8,
  searchableCount: 5,
  lastSyncedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
};

export const demoPodcasts: DemoPodcast[] = [demoPodcast];

export const demoSources: DemoSource[] = [
  {
    id: "src_1",
    podcastId: "pod_1",
    sourceType: "youtube_channel",
    sourceName: "The Roundtable — YouTube",
    sourceUrl: "https://www.youtube.com/@theroundtable",
    authRequired: false,
    autoSync: true,
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    syncStatus: "completed",
    episodesFound: 8,
  },
];

const EPISODE_TITLES = [
  "The Quiet Power of Boring Infrastructure",
  "Why Independent Media is Eating the Cable News Bundle",
  "Inside the Open-Source AI Stack",
  "Building Audience Before Building Product",
  "What Happens When Search Becomes a Conversation",
  "The Long Tail of Podcast Archives",
  "Live: Q&A on Newsroom Tooling",
  "How We Made a Searchable Show Bible",
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function pickStatus(idx: number): {
  transcript: JobStatus;
  embedding: JobStatus;
  processing: JobStatus;
  isSearchable: boolean;
  isTranscribed: boolean;
  isEmbedded: boolean;
} {
  if (idx < 5) {
    return {
      transcript: "completed",
      embedding: "completed",
      processing: "completed",
      isSearchable: true,
      isTranscribed: true,
      isEmbedded: true,
    };
  }
  if (idx === 5) {
    return {
      transcript: "completed",
      embedding: "embedding",
      processing: "embedding",
      isSearchable: false,
      isTranscribed: true,
      isEmbedded: false,
    };
  }
  if (idx === 6) {
    return {
      transcript: "transcribing",
      embedding: "queued",
      processing: "transcribing",
      isSearchable: false,
      isTranscribed: false,
      isEmbedded: false,
    };
  }
  return {
    transcript: "failed",
    embedding: "queued",
    processing: "failed",
    isSearchable: false,
    isTranscribed: false,
    isEmbedded: false,
  };
}

export const demoEpisodes: DemoEpisode[] = EPISODE_TITLES.map((title, i) => {
  const s = pickStatus(i);
  return {
    id: `ep_${i + 1}`,
    podcastId: "pod_1",
    sourceId: "src_1",
    externalId: `yt_video_${i + 1}`,
    episodeTitle: title,
    episodeNumber: i + 1,
    sourceUrl: `https://www.youtube.com/watch?v=demo${i + 1}`,
    sourcePlatform: "youtube" as SourcePlatform,
    publishDate: isoDaysAgo(8 - i),
    durationSeconds: 1800 + i * 420,
    thumbnailUrl: `https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg`,
    transcriptStatus: s.transcript,
    embeddingStatus: s.embedding,
    processingStatus: s.processing,
    isSearchable: s.isSearchable,
    isTranscribed: s.isTranscribed,
    isEmbedded: s.isEmbedded,
  };
});

const SEED_QUOTES: Record<string, string[]> = {
  ep_1: [
    "The most underrated infrastructure is the kind nobody notices until it breaks.",
    "We spent two years rewriting the boring parts and it changed the company.",
    "Boring is a feature. Boring means it works.",
    "If your system needs a hero on call every Tuesday night, it isn't infrastructure — it's a fire pit.",
  ],
  ep_2: [
    "Independent media isn't a niche anymore — it's the default for anyone under thirty.",
    "The bundle was a distribution tactic. Once distribution became free, the bundle became a tax.",
    "Cable news still has talent. It just doesn't have an audience that matches the talent.",
  ],
  ep_3: [
    "Open-source AI isn't winning because it's free. It's winning because it's auditable.",
    "Every closed model eventually leaks behavior; the open ones leak weights and we move on.",
    "Local inference is going to feel obvious in five years.",
  ],
  ep_4: [
    "Build the audience first. The product is downstream of the audience.",
    "If you can't get a hundred people to care before launch, you don't have a product, you have an asset.",
  ],
  ep_5: [
    "Search becoming a conversation means the index has to know what you mean, not just what you typed.",
    "We're going to look back on the ten-blue-links era the way we look at dial-up.",
    "The killer feature is being able to ask a question and get a citation back.",
  ],
  ep_6: [
    "Most podcast archives are write-only. Nobody can find anything in them.",
    "We treat episodes like memory, but they live like landfill.",
  ],
};

export const demoTranscriptSegments: DemoTranscriptSegment[] = [];
let segIdCounter = 1;
for (const ep of demoEpisodes) {
  if (!ep.isTranscribed) continue;
  const quotes = SEED_QUOTES[ep.id] ?? [
    "Welcome back to the show.",
    "Today we're going to dig into something that doesn't get talked about enough.",
    "Let's start at the beginning.",
  ];
  let cursor = 30;
  for (const q of quotes) {
    const dur = 14 + Math.floor(Math.random() * 16);
    demoTranscriptSegments.push({
      id: `seg_${segIdCounter++}`,
      episodeId: ep.id,
      podcastId: ep.podcastId,
      startTimeSeconds: cursor,
      endTimeSeconds: cursor + dur,
      transcriptText: q,
      confidenceScore: 0.86 + Math.random() * 0.13,
      sourceUrl: ep.sourceUrl,
      sourcePlatform: ep.sourcePlatform,
      transcriptSourceType: "whisper_api",
    });
    cursor += dur + 4;
  }
}

export const demoProcessingJobs: DemoProcessingJob[] = [
  {
    id: "job_1",
    episodeId: "ep_6",
    episodeTitle: EPISODE_TITLES[5],
    podcastName: demoPodcast.name,
    jobType: "embedding",
    status: "embedding",
    progressPercent: 62,
    workerId: "worker-local-01",
    startedAt: new Date(Date.now() - 1000 * 90).toISOString(),
    completedAt: null,
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(Date.now() - 1000 * 600).toISOString(),
  },
  {
    id: "job_2",
    episodeId: "ep_7",
    episodeTitle: EPISODE_TITLES[6],
    podcastName: demoPodcast.name,
    jobType: "transcription",
    status: "transcribing",
    progressPercent: 38,
    workerId: "worker-local-01",
    startedAt: new Date(Date.now() - 1000 * 240).toISOString(),
    completedAt: null,
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(Date.now() - 1000 * 800).toISOString(),
  },
  {
    id: "job_3",
    episodeId: "ep_8",
    episodeTitle: EPISODE_TITLES[7],
    podcastName: demoPodcast.name,
    jobType: "download",
    status: "failed",
    progressPercent: 0,
    workerId: "worker-local-01",
    startedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 33).toISOString(),
    retryCount: 2,
    errorMessage:
      "yt-dlp: HTTP 403 — try refreshing YOUTUBE_COOKIES_FILE or rotating IP",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "job_4",
    episodeId: "ep_5",
    episodeTitle: EPISODE_TITLES[4],
    podcastName: demoPodcast.name,
    jobType: "indexing",
    status: "completed",
    progressPercent: 100,
    workerId: "worker-local-01",
    startedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 88).toISOString(),
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 92).toISOString(),
  },
  {
    id: "job_5",
    episodeId: "ep_4",
    episodeTitle: EPISODE_TITLES[3],
    podcastName: demoPodcast.name,
    jobType: "embedding",
    status: "completed",
    progressPercent: 100,
    workerId: "worker-local-01",
    startedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 117).toISOString(),
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 125).toISOString(),
  },
];

export const demoDownloads: DemoDownload[] = demoEpisodes.map((ep, i) => ({
  id: `dl_${i + 1}`,
  episodeId: ep.id,
  episodeTitle: ep.episodeTitle,
  podcastName: demoPodcast.name,
  downloadType: "audio",
  status:
    ep.processingStatus === "failed"
      ? "failed"
      : ep.isTranscribed
        ? "completed"
        : ep.processingStatus === "transcribing"
          ? "completed"
          : "queued",
  progressPercent: ep.processingStatus === "failed" ? 0 : 100,
  filePath: ep.isTranscribed ? `/storage/audio/${ep.externalId}.m4a` : null,
  startedAt: new Date(Date.now() - 1000 * 60 * (60 + i * 5)).toISOString(),
  completedAt: ep.isTranscribed
    ? new Date(Date.now() - 1000 * 60 * (40 + i * 5)).toISOString()
    : null,
  errorMessage: ep.processingStatus === "failed" ? "yt-dlp HTTP 403" : null,
}));

export const demoSearchResults: DemoSearchResult[] = demoTranscriptSegments
  .slice(0, 8)
  .map((seg, i) => {
    const ep = demoEpisodes.find((e) => e.id === seg.episodeId)!;
    return {
      id: `res_${i + 1}`,
      podcastId: ep.podcastId,
      podcastName: demoPodcast.name,
      episodeId: ep.id,
      episodeTitle: ep.episodeTitle,
      episodeNumber: ep.episodeNumber,
      publishDate: ep.publishDate,
      startTimeSeconds: seg.startTimeSeconds,
      endTimeSeconds: seg.endTimeSeconds,
      transcriptText: seg.transcriptText,
      sourceUrl: seg.sourceUrl,
      sourcePlatform: seg.sourcePlatform,
      relevanceScore: 0.91 - i * 0.04,
      thumbnailUrl: ep.thumbnailUrl,
    };
  });

export const demoSearchHistory: DemoSearchHistory[] = [
  {
    id: "sh_1",
    queryText: "boring infrastructure",
    filtersUsed: "archive: The Roundtable",
    resultCount: 4,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "sh_2",
    queryText: "open source AI",
    filtersUsed: "—",
    resultCount: 7,
    createdAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  {
    id: "sh_3",
    queryText: "build audience first",
    filtersUsed: "—",
    resultCount: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: "sh_4",
    queryText: "search becomes a conversation",
    filtersUsed: "date: last 30 days",
    resultCount: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
];

export const demoUsage = {
  transcriptionMinutes: 412,
  transcriptionCostUsd: 2.47,
  embeddingTokens: 184_000,
  embeddingCostUsd: 0.37,
  storageBytes: 1_842_000_000,
  computeMinutes: 56,
  creditsRemaining: 87,
  creditsTotal: 100,
  monthLabel: new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  }),
};

export const demoStats = {
  totalArchives: demoPodcasts.length,
  totalEpisodes: demoEpisodes.length,
  searchableEpisodes: demoEpisodes.filter((e) => e.isSearchable).length,
  queuedJobs: demoProcessingJobs.filter(
    (j) => j.status === "queued" || j.status === "running",
  ).length,
  failedJobs: demoProcessingJobs.filter((j) => j.status === "failed").length,
  activeJobs: demoProcessingJobs.filter(
    (j) =>
      j.status !== "completed" &&
      j.status !== "queued" &&
      j.status !== "failed",
  ).length,
};

export function getDemoEpisode(id: string): DemoEpisode | undefined {
  return demoEpisodes.find((e) => e.id === id);
}

export function getDemoSegmentsForEpisode(
  episodeId: string,
): DemoTranscriptSegment[] {
  return demoTranscriptSegments.filter((s) => s.episodeId === episodeId);
}

export function searchDemo(query: string): DemoSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return demoSearchResults;
  return demoTranscriptSegments
    .filter((s) => s.transcriptText.toLowerCase().includes(q))
    .map((seg, i) => {
      const ep = demoEpisodes.find((e) => e.id === seg.episodeId)!;
      return {
        id: `res_${i + 1}`,
        podcastId: ep.podcastId,
        podcastName: demoPodcast.name,
        episodeId: ep.id,
        episodeTitle: ep.episodeTitle,
        episodeNumber: ep.episodeNumber,
        publishDate: ep.publishDate,
        startTimeSeconds: seg.startTimeSeconds,
        endTimeSeconds: seg.endTimeSeconds,
        transcriptText: seg.transcriptText,
        sourceUrl: seg.sourceUrl,
        sourcePlatform: seg.sourcePlatform,
        relevanceScore: 0.95 - i * 0.05,
        thumbnailUrl: ep.thumbnailUrl,
      };
    });
}
