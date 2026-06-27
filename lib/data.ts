/**
 * Unified data layer.
 *
 * Every page reads through this module instead of touching `demoData.ts` or
 * Prisma directly. The shape of every return value is the same in both
 * modes (demo and real DB), so pages don't care which mode they're in.
 *
 * Mode selection:
 *   - `IS_DEMO_MODE === true`            → mock data from /lib/demoData.ts
 *   - `!hasDatabase()`                   → mock data (no DB configured)
 *   - otherwise                          → real Postgres via Prisma
 *
 * Errors from the DB layer fall back to empty arrays / sensible defaults
 * so a misconfigured env never crashes the dashboard. Errors are logged
 * to the server console.
 */
import { COST_MODEL, IS_DEMO_MODE } from "./constants";
import { getTranscriptionCostPerMinute, getTranscriptionBackend } from "./transcriptionConfig";
import { hasDatabase, getDb } from "./db";
import { resolveThumbnailUrl } from "./utils";
import {
  demoDownloads,
  demoEpisodes,
  demoPodcast,
  demoPodcasts,
  demoProcessingJobs,
  demoSearchHistory,
  demoSearchResults,
  demoSources,
  demoStats,
  demoTranscriptSegments,
  demoUsage,
  searchDemo,
  type DemoDownload,
  type DemoEpisode,
  type DemoPodcast,
  type DemoProcessingJob,
  type DemoSearchHistory,
  type DemoSearchResult,
  type DemoSource,
  type DemoTranscriptSegment,
} from "./demoData";

// Re-export the demo types as the canonical view types. These are shaped
// for the UI; both demo and real DB queries return them.
export type EpisodeView = DemoEpisode;
export type PodcastView = DemoPodcast;
export type SourceView = DemoSource;
export type ProcessingJobView = DemoProcessingJob;
export type DownloadView = DemoDownload;
export type TranscriptSegmentView = DemoTranscriptSegment;
export type SearchResultView = DemoSearchResult;
export type SearchHistoryView = DemoSearchHistory;

/** Featured clip surfaced on the dashboard ("clip of the week"). */
export type FeaturedClip = SearchResultView & { searchQuery: string };

export type DashboardStats = {
  totalArchives: number;
  totalEpisodes: number;
  searchableEpisodes: number;
  queuedJobs: number;
  failedJobs: number;
  activeJobs: number;
};

/** Creator-facing rollup for the dashboard cockpit. */
export type CockpitSummary = {
  archives: PodcastView[];
  sources: SourceView[];
  stats: DashboardStats;
  totalHours: number;
  searchableHours: number;
  coveragePercent: number;
  transcriptMoments: number;
  transcribedEpisodes: number;
  backlogEpisodes: number;
  workerActive: boolean;
};

/** Lightweight snapshot for dashboard polling (no archives/sources lists). */
export type DashboardLiveSnapshot = Pick<
  CockpitSummary,
  | "stats"
  | "totalHours"
  | "searchableHours"
  | "coveragePercent"
  | "transcriptMoments"
  | "transcribedEpisodes"
  | "backlogEpisodes"
  | "workerActive"
> & {
  activeJobs: ProcessingJobView[];
};

export type UsageStats = typeof demoUsage;

export type BackfillEstimate = {
  remainingEpisodes: number;
  remainingMinutes: number;
  whisperCostUsd: number;
  embeddingCostUsd: number;
  totalCostUsd: number;
  totalCostUsdLow: number;
  totalCostUsdHigh: number;
};

export type UsagePayload = {
  usage: UsageStats;
  backfill: BackfillEstimate;
};

export function useDemoData(): boolean {
  return IS_DEMO_MODE || !hasDatabase();
}

export function getDataMode(): "demo" | "real" {
  return useDemoData() ? "demo" : "real";
}

function logError(label: string, err: unknown) {
  if (process.env.NODE_ENV !== "test") {
    console.error(
      `[data] ${label} failed — falling back. ${(err as Error)?.message ?? err}`,
    );
  }
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  if (useDemoData()) return demoStats;
  try {
    const db = getDb();
    const [
      totalArchives,
      totalEpisodes,
      searchableEpisodes,
      queuedJobs,
      failedJobs,
      activeJobs,
    ] = await Promise.all([
      db.podcast.count(),
      db.episode.count(),
      db.episode.count({ where: { isSearchable: true } }),
      db.processingJob.count({ where: { status: "queued" } }),
      db.processingJob.count({ where: { status: "failed" } }),
      db.processingJob.count({
        where: {
          NOT: { status: { in: ["completed", "queued", "failed"] } },
        },
      }),
    ]);
    return {
      totalArchives,
      totalEpisodes,
      searchableEpisodes,
      queuedJobs,
      failedJobs,
      activeJobs,
    };
  } catch (err) {
    logError("getDashboardStats", err);
    return {
      totalArchives: 0,
      totalEpisodes: 0,
      searchableEpisodes: 0,
      queuedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
    };
  }
}

/** Aggregated creator metrics for the dashboard cockpit. */
export async function getCockpitSummary(): Promise<CockpitSummary> {
  const empty: CockpitSummary = {
    archives: [],
    sources: [],
    stats: {
      totalArchives: 0,
      totalEpisodes: 0,
      searchableEpisodes: 0,
      queuedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
    },
    totalHours: 0,
    searchableHours: 0,
    coveragePercent: 0,
    transcriptMoments: 0,
    transcribedEpisodes: 0,
    backlogEpisodes: 0,
    workerActive: false,
  };

  if (useDemoData()) {
    const totalSec = demoEpisodes.reduce((a, e) => a + e.durationSeconds, 0);
    const searchSec = demoEpisodes
      .filter((e) => e.isSearchable)
      .reduce((a, e) => a + e.durationSeconds, 0);
    const transcribed = demoEpisodes.filter((e) => e.isTranscribed).length;
    const searchable = demoStats.searchableEpisodes;
    return {
      archives: demoPodcasts,
      sources: demoSources,
      stats: demoStats,
      totalHours: totalSec / 3600,
      searchableHours: searchSec / 3600,
      coveragePercent:
        demoStats.totalEpisodes > 0
          ? Math.round((searchable / demoStats.totalEpisodes) * 100)
          : 0,
      transcriptMoments: demoTranscriptSegments.length,
      transcribedEpisodes: transcribed,
      backlogEpisodes: demoStats.totalEpisodes - searchable,
      workerActive: demoStats.activeJobs > 0,
    };
  }

  try {
    const db = getDb();
    const settled = await Promise.allSettled([
      getPodcasts(),
      getSources(),
      getDashboardStats(),
      db.episode.aggregate({ _sum: { durationSeconds: true } }),
      db.episode.aggregate({
        where: { isSearchable: true },
        _sum: { durationSeconds: true },
      }),
      db.episode.count({ where: { isTranscribed: true } }),
      db.transcriptSegment.count(),
    ]);

    let archives =
      settled[0].status === "fulfilled" ? settled[0].value : [];
    let sources =
      settled[1].status === "fulfilled" ? settled[1].value : [];
    const stats =
      settled[2].status === "fulfilled"
        ? settled[2].value
        : empty.stats;
    const durations =
      settled[3].status === "fulfilled"
        ? settled[3].value
        : { _sum: { durationSeconds: 0 } };
    const searchableDur =
      settled[4].status === "fulfilled"
        ? settled[4].value
        : { _sum: { durationSeconds: 0 } };
    const transcribed =
      settled[5].status === "fulfilled" ? settled[5].value : 0;
    const moments =
      settled[6].status === "fulfilled" ? settled[6].value : 0;

    for (const r of settled) {
      if (r.status === "rejected") {
        logError("getCockpitSummary partial", r.reason);
      }
    }

    const totalEpisodes = stats.totalEpisodes;
    const searchable = stats.searchableEpisodes;
    const totalSec = durations._sum.durationSeconds ?? 0;
    const searchSec = searchableDur._sum.durationSeconds ?? 0;

    if (
      totalEpisodes === 0 &&
      archives.length === 0 &&
      sources.length === 0
    ) {
      return empty;
    }

    // Stats can succeed while list queries fail under pool pressure — backfill.
    if (totalEpisodes > 0 && sources.length === 0) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const retried = await getSources();
        if (retried.length > 0) {
          sources = retried;
          break;
        }
        await sleep(250 * (attempt + 1));
      }
    }
    if (totalEpisodes > 0 && archives.length === 0) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const retried = await getPodcasts();
        if (retried.length > 0) {
          archives = retried;
          break;
        }
        await sleep(250 * (attempt + 1));
      }
    }

    return {
      archives,
      sources,
      stats,
      totalHours: totalSec / 3600,
      searchableHours: searchSec / 3600,
      coveragePercent:
        totalEpisodes > 0
          ? Math.round((searchable / totalEpisodes) * 100)
          : 0,
      transcriptMoments: moments,
      transcribedEpisodes: transcribed,
      backlogEpisodes: totalEpisodes - searchable,
      workerActive: stats.activeJobs > 0 || stats.queuedJobs > 0,
    };
  } catch (err) {
    logError("getCockpitSummary", err);
    return empty;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Episodes without a source list usually means getSources failed, not an empty library. */
export function cockpitSourcesMissing(cockpit: CockpitSummary): boolean {
  return cockpit.stats.totalEpisodes > 0 && cockpit.sources.length === 0;
}

function cockpitIsComplete(cockpit: CockpitSummary): boolean {
  if (!dashboardHasArchiveData(cockpit)) return false;
  if (cockpitSourcesMissing(cockpit)) return false;
  return true;
}

/** One retry helps survive transient Supabase pool blips on Vercel. */
export async function getCockpitSummaryWithRetry(): Promise<CockpitSummary> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await getCockpitSummary();
    if (cockpitIsComplete(result)) return result;
    if (attempt < 2) await sleep(300 * (attempt + 1));
  }
  return getCockpitSummary();
}

function dashboardHasArchiveData(cockpit: CockpitSummary): boolean {
  return (
    cockpit.sources.length > 0 ||
    cockpit.stats.totalEpisodes > 0 ||
    cockpit.archives.length > 0
  );
}

/** DB-only metrics that change during processing — for client polling. */
export function buildLiveSnapshot(
  cockpit: CockpitSummary,
  activeJobs: ProcessingJobView[],
): DashboardLiveSnapshot {
  return {
    stats: cockpit.stats,
    totalHours: cockpit.totalHours,
    searchableHours: cockpit.searchableHours,
    coveragePercent: cockpit.coveragePercent,
    transcriptMoments: cockpit.transcriptMoments,
    transcribedEpisodes: cockpit.transcribedEpisodes,
    backlogEpisodes: cockpit.backlogEpisodes,
    workerActive: cockpit.workerActive,
    activeJobs,
  };
}

export async function getDashboardLiveSnapshot(): Promise<DashboardLiveSnapshot> {
  const empty: DashboardLiveSnapshot = {
    stats: {
      totalArchives: 0,
      totalEpisodes: 0,
      searchableEpisodes: 0,
      queuedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
    },
    totalHours: 0,
    searchableHours: 0,
    coveragePercent: 0,
    transcriptMoments: 0,
    transcribedEpisodes: 0,
    backlogEpisodes: 0,
    workerActive: false,
    activeJobs: [],
  };

  if (useDemoData()) {
    const totalSec = demoEpisodes.reduce((a, e) => a + e.durationSeconds, 0);
    const searchSec = demoEpisodes
      .filter((e) => e.isSearchable)
      .reduce((a, e) => a + e.durationSeconds, 0);
    const transcribed = demoEpisodes.filter((e) => e.isTranscribed).length;
    const searchable = demoStats.searchableEpisodes;
    const activeJobs = demoProcessingJobs.filter(
      (j) => j.status !== "completed" && j.status !== "queued",
    );
    return {
      stats: demoStats,
      totalHours: totalSec / 3600,
      searchableHours: searchSec / 3600,
      coveragePercent:
        demoStats.totalEpisodes > 0
          ? Math.round((searchable / demoStats.totalEpisodes) * 100)
          : 0,
      transcriptMoments: demoTranscriptSegments.length,
      transcribedEpisodes: transcribed,
      backlogEpisodes: demoStats.totalEpisodes - searchable,
      workerActive: demoStats.activeJobs > 0 || demoStats.queuedJobs > 0,
      activeJobs,
    };
  }

  try {
    const [cockpit, activeJobs] = await Promise.all([
      getCockpitSummaryWithRetry(),
      getActiveProcessingJobs(),
    ]);
    return buildLiveSnapshot(cockpit, activeJobs);
  } catch (err) {
    logError("getDashboardLiveSnapshot", err);
    return empty;
  }
}

// ─── Podcasts / archives ───────────────────────────────────────────────────

export async function getPodcasts(): Promise<PodcastView[]> {
  if (useDemoData()) return demoPodcasts;
  try {
    const db = getDb();
    const rows = await db.podcast.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { episodes: true } },
        episodes: {
          select: { isSearchable: true },
        },
      },
    });
    const lastSync = await Promise.all(
      rows.map((p) =>
        db.source.findFirst({
          where: { podcastId: p.id, lastSyncedAt: { not: null } },
          orderBy: { lastSyncedAt: "desc" },
          select: { lastSyncedAt: true },
        }),
      ),
    );
    return rows.map((p, i): PodcastView => {
      const searchable = p.episodes.filter((e) => e.isSearchable).length;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description ?? "",
        coverImageUrl: p.coverImageUrl ?? "",
        officialUrl: p.officialUrl ?? "",
        episodeCount: p._count.episodes,
        searchableCount: searchable,
        lastSyncedAt:
          lastSync[i]?.lastSyncedAt?.toISOString() ?? new Date(0).toISOString(),
      };
    });
  } catch (err) {
    logError("getPodcasts", err);
    return [];
  }
}

// ─── Sources ──────────────────────────────────────────────────────────────

/** Global auto-sync rollup for the dashboard master switch. */
export async function getAutoSyncSummary(): Promise<{
  total: number;
  enabled: number;
}> {
  if (useDemoData()) {
    return {
      total: demoSources.length,
      enabled: demoSources.filter((s) => s.autoSync).length,
    };
  }
  try {
    const db = getDb();
    const [total, enabled] = await Promise.all([
      db.source.count(),
      db.source.count({ where: { autoSync: true } }),
    ]);
    return { total, enabled };
  } catch (err) {
    logError("getAutoSyncSummary", err);
    return { total: 0, enabled: 0 };
  }
}

export async function getSources(): Promise<SourceView[]> {
  if (useDemoData()) return demoSources;
  try {
    const db = getDb();
    const rows = await db.source.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { episodes: true } } },
    });
    return rows.map(
      (s): SourceView => ({
        id: s.id,
        podcastId: s.podcastId,
        sourceType: s.sourceType as SourceView["sourceType"],
        sourceName: s.sourceName,
        sourceUrl: s.sourceUrl,
        authRequired: s.authRequired,
        autoSync: s.autoSync,
        lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
        syncStatus: s.syncStatus as SourceView["syncStatus"],
        episodesFound: s._count.episodes,
      }),
    );
  } catch (err) {
    logError("getSources", err);
    return [];
  }
}

/** Retry when the first query returns empty under transient pool errors. */
export async function getSourcesWithRetry(): Promise<SourceView[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await getSources();
    if (result.length > 0) return result;
    if (attempt < 2) await sleep(300 * (attempt + 1));
  }
  return getSources();
}

// ─── Episodes ─────────────────────────────────────────────────────────────

export type EpisodeFilters = {
  archiveId?: string;
  status?: "searchable" | "failed" | "processing";
  limit?: number;
};

export async function getEpisodes(
  filters: EpisodeFilters = {},
): Promise<EpisodeView[]> {
  if (useDemoData()) {
    let episodes = demoEpisodes;
    if (filters.archiveId)
      episodes = episodes.filter((e) => e.podcastId === filters.archiveId);
    if (filters.status === "searchable")
      episodes = episodes.filter((e) => e.isSearchable);
    if (filters.status === "failed")
      episodes = episodes.filter((e) => e.processingStatus === "failed");
    if (filters.status === "processing")
      episodes = episodes.filter(
        (e) =>
          e.processingStatus !== "completed" &&
          e.processingStatus !== "failed" &&
          e.processingStatus !== "queued",
      );
    return filters.limit ? episodes.slice(0, filters.limit) : episodes;
  }

  try {
    const db = getDb();
    const where: any = {};
    if (filters.archiveId) where.podcastId = filters.archiveId;
    if (filters.status === "searchable") where.isSearchable = true;
    if (filters.status === "failed") where.processingStatus = "failed";
    if (filters.status === "processing") {
      where.processingStatus = {
        notIn: ["completed", "failed", "queued"],
      };
    }
    const rows = await db.episode.findMany({
      where,
      orderBy: { publishDate: "desc" },
      take: filters.limit ?? 200,
    });
    return rows.map(toEpisodeView);
  } catch (err) {
    logError("getEpisodes", err);
    return [];
  }
}

export async function getEpisode(id: string): Promise<EpisodeView | null> {
  if (useDemoData()) {
    return demoEpisodes.find((e) => e.id === id) ?? null;
  }
  try {
    const db = getDb();
    const row = await db.episode.findUnique({ where: { id } });
    return row ? toEpisodeView(row) : null;
  } catch (err) {
    logError("getEpisode", err);
    return null;
  }
}

export type EpisodeDetailContext = {
  episode: EpisodeView;
  podcast: Pick<
    PodcastView,
    "id" | "name" | "slug" | "officialUrl" | "coverImageUrl"
  >;
  source: Pick<
    SourceView,
    "id" | "sourceName" | "sourceUrl" | "sourceType"
  >;
};

/** Episode plus its owning archive and connected source — for detail attribution. */
export async function getEpisodeWithContext(
  id: string,
): Promise<EpisodeDetailContext | null> {
  if (useDemoData()) {
    const episode = demoEpisodes.find((e) => e.id === id);
    if (!episode) return null;
    const podcast =
      demoPodcasts.find((p) => p.id === episode.podcastId) ?? demoPodcast;
    const source =
      demoSources.find((s) => s.id === episode.sourceId) ?? demoSources[0]!;
    return {
      episode,
      podcast: {
        id: podcast.id,
        name: podcast.name,
        slug: podcast.slug,
        officialUrl: podcast.officialUrl,
        coverImageUrl: podcast.coverImageUrl,
      },
      source: {
        id: source.id,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
      },
    };
  }

  try {
    const db = getDb();
    const row = await db.episode.findUnique({
      where: { id },
      include: {
        podcast: {
          select: {
            id: true,
            name: true,
            slug: true,
            officialUrl: true,
            coverImageUrl: true,
          },
        },
        source: {
          select: {
            id: true,
            sourceName: true,
            sourceUrl: true,
            sourceType: true,
          },
        },
      },
    });
    if (!row?.podcast || !row.source) return null;
    return {
      episode: toEpisodeView(row),
      podcast: {
        id: row.podcast.id,
        name: row.podcast.name,
        slug: row.podcast.slug,
        officialUrl: row.podcast.officialUrl ?? "",
        coverImageUrl: row.podcast.coverImageUrl ?? "",
      },
      source: {
        id: row.source.id,
        sourceName: row.source.sourceName,
        sourceUrl: row.source.sourceUrl,
        sourceType: row.source.sourceType as SourceView["sourceType"],
      },
    };
  } catch (err) {
    logError("getEpisodeWithContext", err);
    return null;
  }
}

export type EpisodeUsage = {
  audioBytes: number;
  embeddingTokens: number;
  durationSeconds: number;
  isTranscribed: boolean;
  transcriptionCostUsd: number;
  embeddingCostUsd: number;
  totalCostUsd: number;
};

/** Real, per-episode usage + cost derived from measured metering. */
export async function getEpisodeUsage(
  id: string,
): Promise<EpisodeUsage | null> {
  if (useDemoData()) {
    const e = demoEpisodes.find((d) => d.id === id);
    if (!e) return null;
    const minutes = (e.durationSeconds ?? 0) / 60;
    const transcriptionCostUsd = e.isTranscribed
      ? minutes * getTranscriptionCostPerMinute()
      : 0;
    const embeddingTokens = Math.round((e.durationSeconds ?? 0) * 2.6);
    const embeddingCostUsd =
      (embeddingTokens / 1_000_000) * COST_MODEL.embeddingUsdPer1MTokens;
    return {
      audioBytes: Math.round((e.durationSeconds ?? 0) * 16000),
      embeddingTokens,
      durationSeconds: e.durationSeconds ?? 0,
      isTranscribed: e.isTranscribed,
      transcriptionCostUsd,
      embeddingCostUsd,
      totalCostUsd: transcriptionCostUsd + embeddingCostUsd,
    };
  }
  try {
    const db = getDb();
    const e = await db.episode.findUnique({
      where: { id },
      select: {
        audioBytes: true,
        embeddingTokens: true,
        durationSeconds: true,
        isTranscribed: true,
      },
    });
    if (!e) return null;
    const transcriptionCostUsd = e.isTranscribed
      ? ((e.durationSeconds ?? 0) / 60) * getTranscriptionCostPerMinute()
      : 0;
    const embeddingCostUsd =
      (e.embeddingTokens / 1_000_000) * COST_MODEL.embeddingUsdPer1MTokens;
    return {
      audioBytes: e.audioBytes,
      embeddingTokens: e.embeddingTokens,
      durationSeconds: e.durationSeconds ?? 0,
      isTranscribed: e.isTranscribed,
      transcriptionCostUsd,
      embeddingCostUsd,
      totalCostUsd: transcriptionCostUsd + embeddingCostUsd,
    };
  } catch (err) {
    logError("getEpisodeUsage", err);
    return null;
  }
}

export async function getRecentEpisodes(limit = 5): Promise<EpisodeView[]> {
  if (useDemoData()) {
    return [...demoEpisodes]
      .sort(
        (a, b) =>
          new Date(b.publishDate).getTime() -
          new Date(a.publishDate).getTime(),
      )
      .slice(0, limit);
  }
  try {
    const db = getDb();
    const rows = await db.episode.findMany({
      orderBy: { publishDate: "desc" },
      take: limit,
    });
    return rows.map(toEpisodeView);
  } catch (err) {
    logError("getRecentEpisodes", err);
    return [];
  }
}

// ─── Transcript segments ──────────────────────────────────────────────────

export async function getSegmentsForEpisode(
  episodeId: string,
): Promise<TranscriptSegmentView[]> {
  if (useDemoData()) {
    return demoTranscriptSegments.filter((s) => s.episodeId === episodeId);
  }
  try {
    const db = getDb();
    const rows = await db.transcriptSegment.findMany({
      where: { episodeId },
      orderBy: { startTimeSeconds: "asc" },
    });
    return rows.map(
      (s): TranscriptSegmentView => ({
        id: s.id,
        episodeId: s.episodeId,
        podcastId: s.podcastId,
        startTimeSeconds: s.startTimeSeconds,
        endTimeSeconds: s.endTimeSeconds,
        transcriptText: s.transcriptText,
        confidenceScore: s.confidenceScore ?? 0.9,
        sourceUrl: s.sourceUrl,
        sourcePlatform: s.sourcePlatform as TranscriptSegmentView["sourcePlatform"],
        transcriptSourceType:
          s.transcriptSourceType as TranscriptSegmentView["transcriptSourceType"],
      }),
    );
  } catch (err) {
    logError("getSegmentsForEpisode", err);
    return [];
  }
}

// ─── Processing jobs ──────────────────────────────────────────────────────

export type ProcessingJobBucket = {
  active: ProcessingJobView[];
  queued: ProcessingJobView[];
  failed: ProcessingJobView[];
  completed: ProcessingJobView[];
  totals: {
    active: number;
    queued: number;
    failed: number;
  };
};

const PROCESSING_JOB_INCLUDE = {
  episode: {
    select: { episodeTitle: true, podcast: { select: { name: true } } },
  },
} as const;

const ACTIVE_JOB_STATUSES = [
  "running",
  "downloading",
  "transcribing",
  "segmenting",
  "embedding",
  "indexing",
  "extracting_audio",
] as const;

function mapProcessingJobRow(j: {
  id: string;
  episodeId: string | null;
  sourceId: string | null;
  jobType: string;
  status: string;
  progressPercent: number;
  workerId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  retryCount: number;
  errorMessage: string | null;
  createdAt: Date;
  episode: {
    episodeTitle: string;
    podcast: { name: string } | null;
  } | null;
}): ProcessingJobView {
  return {
    id: j.id,
    episodeId: j.episodeId ?? "",
    episodeTitle:
      j.episode?.episodeTitle ??
      (j.sourceId ? `Source sync (${j.sourceId.slice(0, 6)})` : "—"),
    podcastName: j.episode?.podcast?.name ?? "—",
    jobType: j.jobType as ProcessingJobView["jobType"],
    status: j.status as ProcessingJobView["status"],
    progressPercent: j.progressPercent,
    workerId: j.workerId,
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    retryCount: j.retryCount,
    errorMessage: j.errorMessage,
    createdAt: j.createdAt.toISOString(),
  };
}

export async function getProcessingJobs(): Promise<ProcessingJobBucket> {
  if (useDemoData()) {
    const all = demoProcessingJobs;
    return {
      active: all.filter(
        (j) =>
          j.status !== "queued" &&
          j.status !== "completed" &&
          j.status !== "failed",
      ),
      queued: all.filter((j) => j.status === "queued"),
      failed: all.filter((j) => j.status === "failed"),
      completed: all.filter((j) => j.status === "completed").slice(0, 25),
      totals: {
        active: all.filter(
          (j) =>
            j.status !== "queued" &&
            j.status !== "completed" &&
            j.status !== "failed",
        ).length,
        queued: all.filter((j) => j.status === "queued").length,
        failed: all.filter((j) => j.status === "failed").length,
      },
    };
  }

  try {
    const db = getDb();
    const [active, queued, failed, completed, activeTotal, queuedTotal, failedTotal] =
      await Promise.all([
        db.processingJob.findMany({
          where: { status: { in: [...ACTIVE_JOB_STATUSES] } },
          orderBy: { updatedAt: "desc" },
          take: 50,
          include: PROCESSING_JOB_INCLUDE,
        }),
        db.processingJob.findMany({
          where: { status: "queued" },
          orderBy: { createdAt: "asc" },
          take: 50,
          include: PROCESSING_JOB_INCLUDE,
        }),
        db.processingJob.findMany({
          where: { status: "failed" },
          orderBy: { updatedAt: "desc" },
          take: 25,
          include: PROCESSING_JOB_INCLUDE,
        }),
        db.processingJob.findMany({
          where: { status: "completed" },
          orderBy: { completedAt: "desc" },
          take: 25,
          include: PROCESSING_JOB_INCLUDE,
        }),
        db.processingJob.count({
          where: { status: { in: [...ACTIVE_JOB_STATUSES] } },
        }),
        db.processingJob.count({ where: { status: "queued" } }),
        db.processingJob.count({ where: { status: "failed" } }),
      ]);

    return {
      active: active.map(mapProcessingJobRow),
      queued: queued.map(mapProcessingJobRow),
      failed: failed.map(mapProcessingJobRow),
      completed: completed.map(mapProcessingJobRow),
      totals: {
        active: activeTotal,
        queued: queuedTotal,
        failed: failedTotal,
      },
    };
  } catch (err) {
    logError("getProcessingJobs", err);
    return {
      active: [],
      queued: [],
      failed: [],
      completed: [],
      totals: { active: 0, queued: 0, failed: 0 },
    };
  }
}

export async function getAllProcessingJobs(): Promise<ProcessingJobView[]> {
  const bucket = await getProcessingJobs();
  return [
    ...bucket.active,
    ...bucket.queued,
    ...bucket.failed,
    ...bucket.completed,
  ];
}

export async function getActiveProcessingJobs(): Promise<ProcessingJobView[]> {
  if (useDemoData()) {
    return demoProcessingJobs.filter(
      (j) => j.status !== "completed" && j.status !== "queued",
    );
  }
  try {
    const db = getDb();
    const rows = await db.processingJob.findMany({
      where: { status: { in: [...ACTIVE_JOB_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: PROCESSING_JOB_INCLUDE,
    });
    return rows.map(mapProcessingJobRow);
  } catch (err) {
    logError("getActiveProcessingJobs", err);
    return [];
  }
}

// ─── Downloads ────────────────────────────────────────────────────────────

export async function getDownloads(): Promise<DownloadView[]> {
  if (useDemoData()) return demoDownloads;
  try {
    const db = getDb();
    const rows = await db.download.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        episode: {
          select: { episodeTitle: true, podcast: { select: { name: true } } },
        },
      },
    });
    return rows.map(
      (d): DownloadView => ({
        id: d.id,
        episodeId: d.episodeId,
        episodeTitle: d.episode?.episodeTitle ?? "—",
        podcastName: d.episode?.podcast?.name ?? "—",
        downloadType: d.downloadType as DownloadView["downloadType"],
        status: d.status as DownloadView["status"],
        progressPercent: d.progressPercent,
        filePath: d.filePath,
        startedAt: d.startedAt?.toISOString() ?? null,
        completedAt: d.completedAt?.toISOString() ?? null,
        errorMessage: d.errorMessage,
      }),
    );
  } catch (err) {
    logError("getDownloads", err);
    return [];
  }
}

// ─── Search history ───────────────────────────────────────────────────────

export async function getRecentSearches(
  limit = 4,
): Promise<SearchHistoryView[]> {
  if (useDemoData()) return demoSearchHistory.slice(0, limit);
  try {
    const db = getDb();
    const rows = await db.searchQuery.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(
      (q): SearchHistoryView => ({
        id: q.id,
        queryText: q.queryText,
        filtersUsed: q.filtersUsed ?? "—",
        resultCount: q.resultCount,
        createdAt: q.createdAt.toISOString(),
      }),
    );
  } catch (err) {
    logError("getRecentSearches", err);
    return [];
  }
}

// ─── Usage ────────────────────────────────────────────────────────────────

/**
 * Real usage rollup.
 *
 * Scope: transcription / embeddings / storage are **lifetime** totals (the
 * cost the archive has accrued to date). Compute + credits are scoped to the
 * **current calendar month**, since the budget in scheduler_settings is
 * expressed as "minutes per month".
 *
 * Every figure is an estimate — we don't store exact token counts or file
 * sizes — derived from audio duration + transcript text length using
 * COST_MODEL. Actual provider billing is not connected.
 */
export async function getUsageStats(): Promise<UsageStats> {
  if (useDemoData()) return demoUsage;

  const monthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  try {
    const db = getDb();
    const monthStart = startOfCurrentMonth();

    const [transcribedDuration, charRow, measured, settings, runs] =
      await Promise.all([
        // Whisper bills per minute of transcribed audio (this is the real
        // billable quantity).
        db.episode.aggregate({
          where: { isTranscribed: true },
          _sum: { durationSeconds: true },
        }),
        // Transcript bytes stored in Postgres (real).
        db.$queryRaw<{ chars: bigint }[]>`
          SELECT COALESCE(SUM(LENGTH(transcript_text)), 0)::bigint AS chars
          FROM transcript_segments
        `,
        // Measured usage: real OpenAI embedding tokens + real downloaded bytes.
        db.episode.aggregate({
          _sum: { embeddingTokens: true, audioBytes: true },
        }),
        db.schedulerSettings.findFirst(),
        // Real worker wall-clock time this month.
        db.workerRun.findMany({
          where: { startedAt: { gte: monthStart } },
          select: { startedAt: true, completedAt: true },
        }),
      ]);

    const transcriptionMinutes = Math.round(
      (transcribedDuration._sum.durationSeconds ?? 0) / 60,
    );
    const transcriptionCostUsd =
      transcriptionMinutes * getTranscriptionCostPerMinute();

    const transcriptChars = Number(charRow[0]?.chars ?? 0);
    const embeddingTokens = measured._sum.embeddingTokens ?? 0;
    const embeddingCostUsd =
      (embeddingTokens / 1_000_000) * COST_MODEL.embeddingUsdPer1MTokens;

    const audioBytes = measured._sum.audioBytes ?? 0;
    const storageBytes =
      audioBytes + // real downloaded audio
      transcriptChars; // transcripts ≈ 1 byte/char (UTF-8 ASCII)

    const computeMs = runs.reduce((acc, r) => {
      const end = r.completedAt?.getTime() ?? Date.now();
      return acc + Math.max(0, end - r.startedAt.getTime());
    }, 0);
    const computeMinutes = Math.round(computeMs / 60_000);

    const creditsTotal =
      settings?.computeLimit ?? COST_MODEL.defaultComputeLimitMinutes;
    const creditsRemaining = Math.max(0, creditsTotal - computeMinutes);

    return {
      transcriptionMinutes,
      transcriptionCostUsd,
      embeddingTokens,
      embeddingCostUsd,
      storageBytes,
      computeMinutes,
      creditsRemaining,
      creditsTotal,
      monthLabel,
    };
  } catch (err) {
    logError("getUsageStats", err);
    return {
      transcriptionMinutes: 0,
      transcriptionCostUsd: 0,
      embeddingTokens: 0,
      embeddingCostUsd: 0,
      storageBytes: 0,
      computeMinutes: 0,
      creditsRemaining: COST_MODEL.defaultComputeLimitMinutes,
      creditsTotal: COST_MODEL.defaultComputeLimitMinutes,
      monthLabel,
    };
  }
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Estimate embedding tokens from audio length when not yet transcribed. */
function estimateEmbeddingTokens(durationSeconds: number): number {
  return Math.round(durationSeconds * COST_MODEL.tokensPerSecondOfSpeech);
}

type BackfillEpisodeRow = {
  durationSeconds: number | null;
  isTranscribed: boolean;
  embeddingTokens: number;
  sourcePlatform: string;
};

function backfillTranscriptionRatePerMinute(sourcePlatform: string): number {
  const backend = getTranscriptionBackend();
  if (
    backend === "youtube_captions_then_groq" &&
    sourcePlatform.toLowerCase() === "youtube"
  ) {
    return 0;
  }
  return getTranscriptionCostPerMinute(backend);
}

function computeBackfillEstimate(
  episodes: BackfillEpisodeRow[],
  fallbackDurationSeconds: number,
): BackfillEstimate {
  if (episodes.length === 0) {
    return {
      remainingEpisodes: 0,
      remainingMinutes: 0,
      whisperCostUsd: 0,
      embeddingCostUsd: 0,
      totalCostUsd: 0,
      totalCostUsdLow: 0,
      totalCostUsdHigh: 0,
    };
  }

  let remainingSeconds = 0;
  let whisperCostUsd = 0;
  let embeddingCostUsd = 0;

  for (const e of episodes) {
    const sec =
      e.durationSeconds && e.durationSeconds > 0
        ? e.durationSeconds
        : fallbackDurationSeconds;
    remainingSeconds += sec;

    if (!e.isTranscribed) {
      whisperCostUsd +=
        (sec / 60) * backfillTranscriptionRatePerMinute(e.sourcePlatform);
    }

    const tokens =
      e.isTranscribed && e.embeddingTokens > 0
        ? e.embeddingTokens
        : estimateEmbeddingTokens(sec);
    embeddingCostUsd +=
      (tokens / 1_000_000) * COST_MODEL.embeddingUsdPer1MTokens;
  }

  const totalCostUsd = whisperCostUsd + embeddingCostUsd;
  const variance = COST_MODEL.backfillCostVariance;

  return {
    remainingEpisodes: episodes.length,
    remainingMinutes: Math.round(remainingSeconds / 60),
    whisperCostUsd,
    embeddingCostUsd,
    totalCostUsd,
    totalCostUsdLow: totalCostUsd * (1 - variance),
    totalCostUsdHigh: totalCostUsd * (1 + variance),
  };
}

/** Estimated OpenAI cost to finish processing the current backlog. */
export async function getBackfillEstimate(): Promise<BackfillEstimate> {
  if (useDemoData()) {
    const backlog = demoEpisodes.filter((e) => !e.isSearchable);
    return computeBackfillEstimate(
      backlog.map((e) => ({
        durationSeconds: e.durationSeconds ?? null,
        isTranscribed: e.isTranscribed,
        embeddingTokens: Math.round((e.durationSeconds ?? 0) * 2.6),
        sourcePlatform: e.sourcePlatform,
      })),
      3600,
    );
  }

  try {
    const db = getDb();
    const [episodes, avgRow] = await Promise.all([
      db.episode.findMany({
        where: { isSearchable: false },
        select: {
          durationSeconds: true,
          isTranscribed: true,
          embeddingTokens: true,
          sourcePlatform: true,
        },
      }),
      db.episode.aggregate({
        where: { durationSeconds: { gt: 0 } },
        _avg: { durationSeconds: true },
      }),
    ]);

    const fallbackDurationSeconds = Math.round(
      avgRow._avg.durationSeconds ?? 3600,
    );

    return computeBackfillEstimate(episodes, fallbackDurationSeconds);
  } catch (err) {
    logError("getBackfillEstimate", err);
    return computeBackfillEstimate([], 3600);
  }
}

export async function getUsagePayload(): Promise<UsagePayload> {
  const [usage, backfill] = await Promise.all([
    getUsageStats(),
    getBackfillEstimate(),
  ]);
  return { usage, backfill };
}

// ─── First-podcast helper for demo cards ──────────────────────────────────

export async function getPrimaryPodcast(): Promise<PodcastView> {
  if (useDemoData()) return demoPodcast;
  const list = await getPodcasts();
  return list[0] ?? demoPodcast;
}

// ─── Mappers ──────────────────────────────────────────────────────────────

function toEpisodeView(e: any): EpisodeView {
  return {
    id: e.id,
    podcastId: e.podcastId,
    sourceId: e.sourceId,
    externalId: e.externalId,
    episodeTitle: e.episodeTitle,
    episodeNumber: e.episodeNumber ?? null,
    sourceUrl: e.sourceUrl,
    sourcePlatform: e.sourcePlatform,
    publishDate:
      e.publishDate instanceof Date
        ? e.publishDate.toISOString()
        : (e.publishDate ?? new Date(0).toISOString()),
    durationSeconds: e.durationSeconds ?? 0,
    thumbnailUrl: resolveThumbnailUrl({
      localPath: e.thumbnailLocalPath,
      originalUrl: e.thumbnailOriginalUrl,
      externalId: e.externalId,
    }),
    transcriptStatus: e.transcriptStatus as EpisodeView["transcriptStatus"],
    embeddingStatus: e.embeddingStatus as EpisodeView["embeddingStatus"],
    processingStatus: e.processingStatus as EpisodeView["processingStatus"],
    isSearchable: e.isSearchable,
    isTranscribed: e.isTranscribed,
    isEmbedded: e.isEmbedded,
  };
}

// ─── Search wrapper ───────────────────────────────────────────────────────

/**
 * Best recent search hit for the dashboard "clip of the week". Prefers the
 * top result from the most recent successful search; falls back to the latest
 * searchable transcript moment.
 */
export async function getFeaturedClip(): Promise<FeaturedClip | null> {
  if (useDemoData()) {
    const top = demoSearchResults[0];
    if (!top) return null;
    return {
      ...top,
      searchQuery: demoSearchHistory[0]?.queryText ?? "archive highlights",
    };
  }

  try {
    const recent = await getRecentSearches(10);
    const candidate = recent.find((q) => q.resultCount > 0);
    if (candidate) {
      const results = await runSearch(candidate.queryText, { limit: 1 });
      if (results.length > 0) {
        return { ...results[0], searchQuery: candidate.queryText };
      }
    }
    return await getLatestSearchableClip();
  } catch (err) {
    logError("getFeaturedClip", err);
    return null;
  }
}

async function getLatestSearchableClip(): Promise<FeaturedClip | null> {
  const db = getDb();
  const rows = await db.$queryRawUnsafe<
    {
      id: string;
      episode_id: string;
      podcast_id: string;
      start_time_seconds: number;
      end_time_seconds: number;
      transcript_text: string;
      source_url: string;
      source_platform: string;
      episode_title: string;
      episode_number: number | null;
      publish_date: Date | null;
      external_id: string;
      thumbnail_original_url: string | null;
      podcast_name: string;
    }[]
  >(
    `
    SELECT
      ts.id,
      ts.episode_id,
      ts.podcast_id,
      ts.start_time_seconds,
      ts.end_time_seconds,
      ts.transcript_text,
      ts.source_url,
      ts.source_platform,
      e.episode_title,
      e.episode_number,
      e.publish_date,
      e.external_id,
      e.thumbnail_original_url,
      p.name AS podcast_name
    FROM transcript_segments ts
    JOIN episodes e ON e.id = ts.episode_id
    JOIN podcasts p ON p.id = ts.podcast_id
    WHERE e.is_searchable = true
      AND LENGTH(ts.transcript_text) > 80
    ORDER BY ts.created_at DESC
    LIMIT 1
    `,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    podcastId: r.podcast_id,
    podcastName: r.podcast_name,
    episodeId: r.episode_id,
    episodeTitle: r.episode_title,
    episodeNumber: r.episode_number,
    publishDate: r.publish_date?.toISOString() ?? new Date(0).toISOString(),
    startTimeSeconds: Number(r.start_time_seconds),
    endTimeSeconds: Number(r.end_time_seconds),
    transcriptText: r.transcript_text,
    sourceUrl: r.source_url,
    sourcePlatform: r.source_platform as FeaturedClip["sourcePlatform"],
    relevanceScore: 1,
    thumbnailUrl: resolveThumbnailUrl({
      originalUrl: r.thumbnail_original_url,
      externalId: r.external_id,
    }),
    searchQuery: "latest from your archive",
  };
}

export async function runSearch(
  query: string,
  filters: { archiveId?: string; limit?: number } = {},
): Promise<SearchResultView[]> {
  if (useDemoData()) return query ? searchDemo(query) : [];
  // Real-mode search lives in lib/search.ts so it can be reused by API
  // routes and tests. Import lazily to avoid pulling pgvector helpers
  // into demo-only environments. The `await` inside try is critical —
  // returning an un-awaited promise lets rejections escape the catch.
  try {
    const { keywordSearch } = await import("./search");
    return await keywordSearch(query, filters);
  } catch (err) {
    logError("runSearch", err);
    return [];
  }
}
