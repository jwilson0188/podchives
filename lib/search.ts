/**
 * Search service.
 *
 * Three modes:
 *   - keywordSearch: Postgres full-text (websearch_to_tsquery) over transcript_text.
 *   - semanticSearch: pgvector cosine similarity over transcript_embedding.
 *   - hybridSearch:   blend keyword rank + vector similarity (Phase 5).
 *
 * In demo mode, every call short-circuits to /lib/demoData.searchDemo.
 *
 * Result shape is the same across all modes so the UI doesn't care.
 */
import { IS_DEMO_MODE } from "./constants";
import { searchDemo, type DemoSearchResult } from "./demoData";
import { resolveThumbnailUrl } from "./utils";

export type SearchFilters = {
  archiveId?: string;
  sourcePlatform?: string;
  dateFrom?: string;
  dateTo?: string;
  searchableOnly?: boolean;
  limit?: number;
};

export type SearchResult = DemoSearchResult;

/**
 * Phase-4 keyword search over transcript_segments.
 * Uses Postgres FTS — we wire the query in raw SQL so we can control rank.
 */
export async function keywordSearch(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  if (IS_DEMO_MODE) return searchDemo(query);
  if (!query.trim()) return [];

  const { getDb } = await import("./db");
  const db = getDb();
  const limit = filters.limit ?? 50;

  const rows = await db.$queryRawUnsafe<any[]>(
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
      e.thumbnail_local_path,
      e.thumbnail_original_url,
      p.name AS podcast_name,
      ts_rank(
        to_tsvector('english', ts.transcript_text),
        websearch_to_tsquery('english', $1)
      ) AS rank
    FROM transcript_segments ts
    JOIN episodes e ON e.id = ts.episode_id
    JOIN podcasts p ON p.id = ts.podcast_id
    WHERE
      to_tsvector('english', ts.transcript_text) @@ websearch_to_tsquery('english', $1)
      ${filters.archiveId ? "AND ts.podcast_id = $2" : ""}
    ORDER BY rank DESC, ts.start_time_seconds ASC
    LIMIT ${Number(limit) | 0}
    `,
    ...[query, filters.archiveId].filter(Boolean),
  );

  return rows.map((r) => ({
    id: r.id,
    podcastId: r.podcast_id,
    podcastName: r.podcast_name,
    episodeId: r.episode_id,
    episodeTitle: r.episode_title,
    episodeNumber: r.episode_number,
    publishDate: r.publish_date,
    startTimeSeconds: Number(r.start_time_seconds),
    endTimeSeconds: Number(r.end_time_seconds),
    transcriptText: r.transcript_text,
    sourceUrl: r.source_url,
    sourcePlatform: r.source_platform,
    relevanceScore: Math.min(1, Number(r.rank) || 0),
    thumbnailUrl: resolveThumbnailUrl({
      localPath: r.thumbnail_local_path,
      originalUrl: r.thumbnail_original_url,
      externalId: r.external_id,
    }),
  }));
}

/**
 * Phase-5 semantic search via pgvector cosine distance.
 *
 * Requires:
 *   CREATE EXTENSION vector;
 *   CREATE INDEX transcript_segments_embedding_idx
 *     ON transcript_segments USING ivfflat (transcript_embedding vector_cosine_ops);
 */
export async function semanticSearch(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  if (IS_DEMO_MODE) return searchDemo(query);
  if (!query.trim()) return [];

  // TODO(Phase-5): generate query embedding, run vector cosine distance,
  // join episodes/podcasts, return same shape as keywordSearch.
  const { generateEmbedding } = await import("./embeddings");
  const embedding = await generateEmbedding(query);
  if (embedding.length === 0) return [];
  const vec = `[${embedding.join(",")}]`;

  const { getDb } = await import("./db");
  const db = getDb();
  const limit = filters.limit ?? 50;

  const rows = await db.$queryRawUnsafe<any[]>(
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
      e.thumbnail_local_path,
      e.thumbnail_original_url,
      p.name AS podcast_name,
      1 - (ts.transcript_embedding <=> $1::vector) AS similarity
    FROM transcript_segments ts
    JOIN episodes e ON e.id = ts.episode_id
    JOIN podcasts p ON p.id = ts.podcast_id
    WHERE ts.transcript_embedding IS NOT NULL
      ${filters.archiveId ? "AND ts.podcast_id = $2" : ""}
    ORDER BY ts.transcript_embedding <=> $1::vector ASC
    LIMIT ${Number(limit) | 0}
    `,
    ...[vec, filters.archiveId].filter(Boolean),
  );

  return rows.map((r) => ({
    id: r.id,
    podcastId: r.podcast_id,
    podcastName: r.podcast_name,
    episodeId: r.episode_id,
    episodeTitle: r.episode_title,
    episodeNumber: r.episode_number,
    publishDate: r.publish_date,
    startTimeSeconds: Number(r.start_time_seconds),
    endTimeSeconds: Number(r.end_time_seconds),
    transcriptText: r.transcript_text,
    sourceUrl: r.source_url,
    sourcePlatform: r.source_platform,
    relevanceScore: Math.max(0, Math.min(1, Number(r.similarity) || 0)),
    thumbnailUrl: resolveThumbnailUrl({
      localPath: r.thumbnail_local_path,
      originalUrl: r.thumbnail_original_url,
      externalId: r.external_id,
    }),
  }));
}

/**
 * Phase-5 hybrid search: combine keyword rank + cosine similarity.
 * Reciprocal Rank Fusion is a simple, robust default.
 */
export async function hybridSearch(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  if (IS_DEMO_MODE) return searchDemo(query);
  const [keyword, semantic] = await Promise.all([
    keywordSearch(query, filters),
    semanticSearch(query, filters),
  ]);
  const k = 60;
  const scored = new Map<string, SearchResult & { rrf: number }>();
  keyword.forEach((r, i) => {
    scored.set(r.id, { ...r, rrf: 1 / (k + i + 1) });
  });
  semantic.forEach((r, i) => {
    const prev = scored.get(r.id);
    if (prev) prev.rrf += 1 / (k + i + 1);
    else scored.set(r.id, { ...r, rrf: 1 / (k + i + 1) });
  });
  return Array.from(scored.values())
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, filters.limit ?? 50)
    .map((r) => ({ ...r, relevanceScore: Math.min(1, r.rrf * 60) }));
}

export async function saveSearchQuery(args: {
  query: string;
  filters: SearchFilters;
  resultCount: number;
}): Promise<void> {
  if (IS_DEMO_MODE) return;
  try {
    const { hasDatabase, getDb } = await import("./db");
    if (!hasDatabase()) return;
    const db = getDb();
    await db.searchQuery.create({
      data: {
        queryText: args.query,
        filtersUsed: JSON.stringify(args.filters ?? {}),
        resultCount: args.resultCount,
      },
    });
  } catch (err) {
    // Analytics failure should never break a search.
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[search] saveSearchQuery failed: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Format a single search result for display / citation. Adds `citation`
 * (formatted plain-text, ready to paste anywhere) and `timestampUrl`
 * (deep link into the source platform with `?t=Ns`) on top of the raw
 * fields. Pure — does no I/O.
 */
export function formatSearchResult(result: SearchResult) {
  const ts = formatTs(result.startTimeSeconds);
  const ep = result.episodeNumber != null ? ` (Ep. ${result.episodeNumber})` : "";
  const date = result.publishDate
    ? new Date(result.publishDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  const tsUrl = buildTimestampSourceUrl(
    result.sourceUrl,
    result.startTimeSeconds,
  );
  return {
    ...result,
    timestampUrl: tsUrl,
    citation: `"${result.transcriptText.trim()}" — ${result.podcastName}, ${
      result.episodeTitle
    }${ep}${date ? `, ${date}` : ""} @ ${ts} — ${tsUrl}`,
  };
}

export function formatSearchResults(results: SearchResult[]) {
  return results.map(formatSearchResult);
}

function formatTs(s: number): string {
  const t = Math.floor(s);
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Build a source URL that jumps to the segment's start time. Pure. */
export function buildTimestampSourceUrl(
  sourceUrl: string,
  startTimeSeconds: number,
): string {
  if (!sourceUrl) return "";
  const t = Math.max(0, Math.floor(startTimeSeconds));
  try {
    const u = new URL(sourceUrl);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      u.searchParams.set("t", `${t}s`);
      return u.toString();
    }
    u.hash = `t=${t}`;
    return u.toString();
  } catch {
    return sourceUrl;
  }
}
