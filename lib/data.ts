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
import { hasDatabase, getDb } from "./db";
import { resolveThumbnailUrl } from "./utils";
import {
  demoDownloads,
  demoEpisodes,
  demoPodcast,
  demoPodcasts,
  demoProcessingJobs,
  demoSearchHistory,
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

export type DashboardStats = {
  totalArchives: number;
  totalEpisodes: number;
  searchableEpisodes: number;
  queuedJobs: number;
  failedJobs: number;
  activeJobs: number;
};

export type UsageStats = typeof demoUsage;

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
};

export async function getProcessingJobs(): Promise<ProcessingJobBucket> {
  const all = await getAllProcessingJobs();
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
  };
}

export async function getAllProcessingJobs(): Promise<ProcessingJobView[]> {
  if (useDemoData()) return demoProcessingJobs;
  try {
    const db = getDb();
    const rows = await db.processingJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        episode: {
          select: { episodeTitle: true, podcast: { select: { name: true } } },
        },
      },
    });
    return rows.map(
      (j): ProcessingJobView => ({
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
      }),
    );
  } catch (err) {
    logError("getAllProcessingJobs", err);
    return [];
  }
}

export async function getActiveProcessingJobs(): Promise<ProcessingJobView[]> {
  const all = await getAllProcessingJobs();
  return all.filter(
    (j) => j.status !== "completed" && j.status !== "queued",
  );
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
      transcriptionMinutes * COST_MODEL.whisperUsdPerMinute;

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
