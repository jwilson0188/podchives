/**
 * YouTube ingestion service.
 *
 * Wraps `yt-dlp` for metadata + audio extraction. The MVP uses the system
 * `yt-dlp` binary via child_process so we can ship without a heavy SDK.
 *
 * All exported functions return plain JSON-able shapes so they can flow
 * directly into Prisma `create` / `update` calls.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * yt-dlp writes refreshed cookies back to the --cookies file when the session
 * ends. Render mounts secret files read-only (/etc/secrets), which makes
 * yt-dlp crash with "Read-only file system". Copy the cookies to a writable
 * temp path on first use and hand yt-dlp that instead.
 */
function resolveCookiesFile(): string | null {
  const src = process.env.YOUTUBE_COOKIES_FILE;
  if (!src || !fs.existsSync(src)) return null;
  const writable = path.join(os.tmpdir(), "podchives-cookies.txt");
  try {
    const srcMtime = fs.statSync(src).mtimeMs;
    const writableExists = fs.existsSync(writable);
    const writableStale =
      !writableExists ||
      fs.statSync(writable).mtimeMs < srcMtime;
    if (writableStale) fs.copyFileSync(src, writable);
    return writable;
  } catch {
    return src;
  }
}

import type { SourceType } from "./constants";
import { detectSourceType, deriveNameFromRssUrl } from "./sourceTypes";
import { slugify } from "./utils";
import { downloadToFile, localPath, ensureStorageDirs } from "./storage";

export type YouTubeVideo = {
  externalId: string;
  title: string;
  description: string | null;
  publishDate: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  webUrl: string;
  channelId: string | null;
  channelName: string | null;
};

export type YouTubeChannel = {
  channelId: string;
  channelName: string;
  description: string | null;
  thumbnailUrl: string | null;
  channelUrl: string;
  videos: YouTubeVideo[];
};

type YtThumbnail = {
  url?: string;
  height?: number;
  width?: number;
  id?: string;
};

/** Prefer the channel avatar from yt-dlp playlist/channel JSON. */
export function pickChannelAvatarUrl(thumbnails: YtThumbnail[]): string | null {
  if (!thumbnails?.length) return null;
  const avatar = thumbnails.find(
    (t) =>
      t.id === "avatar_uncropped" ||
      t.id === "7" ||
      t.id === "6" ||
      (t.url?.includes("yt3.googleusercontent.com") &&
        t.height &&
        t.width &&
        Math.abs(t.height - t.width) <= 32),
  );
  if (avatar?.url) return avatar.url;
  const squares = thumbnails
    .filter(
      (t) =>
        t.url &&
        t.height &&
        t.width &&
        Math.abs(t.height - t.width) <= 32,
    )
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return squares[0]?.url ?? null;
}

function parseChannelProfileJson(
  info: Record<string, unknown>,
): Omit<YouTubeChannel, "videos"> | null {
  if (!info || typeof info !== "object") return null;

  const thumbnails = (info.thumbnails as YtThumbnail[]) ?? [];
  const channelUrl =
    (info.channel_url as string | undefined) ??
    (info.uploader_url as string | undefined) ??
    (info.channel_id
      ? `https://www.youtube.com/channel/${info.channel_id}`
      : undefined);

  const channelName =
    (info.channel as string | undefined) ??
    (info.uploader as string | undefined) ??
    (info.title as string | undefined) ??
    "Unknown channel";

  const channelId =
    (info.channel_id as string | undefined) ??
    (typeof info.id === "string" && info.id.startsWith("UC")
      ? info.id
      : slugify(channelName));

  return {
    channelId,
    channelName,
    description: (info.description as string | undefined) ?? null,
    thumbnailUrl: pickChannelAvatarUrl(thumbnails),
    channelUrl: channelUrl ?? "",
  };
}

/**
 * Fetch channel name, description, and avatar via yt-dlp. Works for channel
 * handles, `/channel/…` URLs, and playlists (follows `channel_url` when needed).
 */
export async function fetchYouTubeChannelProfile(
  sourceUrl: string,
): Promise<Omit<YouTubeChannel, "videos">> {
  const out = await runYtDlp([
    "--dump-single-json",
    "--playlist-end",
    "1",
    sourceUrl,
  ]);
  let info: Record<string, unknown>;
  try {
    info = JSON.parse(out.trim());
  } catch {
    throw new Error("yt-dlp returned invalid channel JSON");
  }

  let profile = parseChannelProfileJson(info);
  if (!profile) {
    throw new Error("Could not parse YouTube channel profile");
  }

  if (
    !profile.thumbnailUrl &&
    profile.channelUrl &&
    profile.channelUrl !== sourceUrl
  ) {
    try {
      const channelOut = await runYtDlp([
        "--dump-single-json",
        "--playlist-end",
        "1",
        profile.channelUrl,
      ]);
      const channelInfo = JSON.parse(channelOut.trim()) as Record<
        string,
        unknown
      >;
      const channelProfile = parseChannelProfileJson(channelInfo);
      if (channelProfile?.thumbnailUrl) {
        profile = { ...profile, thumbnailUrl: channelProfile.thumbnailUrl };
      }
    } catch {
      // Playlist pages often lack avatars; secondary fetch is best-effort.
    }
  }

  return profile;
}

/** Shared flags for yt-dlp. Cookies + a JS runtime are required for reliable
 * logged-in YouTube downloads as of late 2025 (see Dockerfile / yt-dlp EJS). */
function buildYtDlpBaseArgs(): string[] {
  const args = [
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    // `default` lets yt-dlp choose JS-challenge-capable clients (needed with
    // cookies). The android client returns truncated formats without a PO token.
    "--extractor-args",
    "youtube:player_client=default",
    // Fetch the EJS challenge-solver lib if it isn't bundled. Harmless when it
    // already is. Requires a JS runtime (Deno) to be installed.
    "--remote-components",
    "ejs:github",
  ];

  const cookiesFile = resolveCookiesFile();
  const cookiesBrowser = process.env.YOUTUBE_COOKIES_FROM_BROWSER;

  if (cookiesFile) {
    args.push("--cookies", cookiesFile);
  } else if (cookiesBrowser) {
    // e.g. YOUTUBE_COOKIES_FROM_BROWSER=chrome
    args.push("--cookies-from-browser", cookiesBrowser);
  }

  return args;
}

export function parseYtDlpProgress(line: string): number | null {
  const download = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (download) {
    return Math.min(100, Math.max(0, Math.round(Number(download[1]))));
  }
  const extract = line.match(/\[ExtractAudio\]\s+(\d+(?:\.\d+)?)%/);
  if (extract) {
    return Math.min(100, Math.max(0, Math.round(Number(extract[1]))));
  }
  return null;
}

export function runYtDlp(
  args: string[],
  opts?: { onStderrLine?: (line: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullArgs = [...buildYtDlpBaseArgs(), ...args];
    const child = spawn("yt-dlp", fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => {
      const chunk = d.toString();
      err += chunk;
      if (opts?.onStderrLine) {
        for (const line of chunk.split(/\r?\n/)) {
          if (line.trim()) opts.onStderrLine(line);
        }
      }
    });
    child.on("error", (e) =>
      reject(
        new Error(
          `yt-dlp failed to start. Is it installed? (${e.message})`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `yt-dlp exited with code ${code}`));
        return;
      }
      resolve(out);
    });
  });
}

function parseInfoLine(line: string): YouTubeVideo | null {
  if (!line.trim()) return null;
  let info: any;
  try {
    info = JSON.parse(line);
  } catch {
    return null;
  }
  if (!info.id || !info.title) return null;
  const externalId = info.id as string;
  const publish: string | null = info.upload_date
    ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(
        4,
        6,
      )}-${info.upload_date.slice(6, 8)}T00:00:00.000Z`
    : info.timestamp
      ? new Date(info.timestamp * 1000).toISOString()
      : null;
  return {
    externalId,
    title: info.title,
    description: info.description ?? null,
    publishDate: publish,
    durationSeconds:
      typeof info.duration === "number" ? Math.round(info.duration) : null,
    thumbnailUrl:
      info.thumbnail ??
      `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`,
    webUrl: info.webpage_url ?? `https://www.youtube.com/watch?v=${externalId}`,
    channelId: info.channel_id ?? null,
    channelName: info.channel ?? info.uploader ?? null,
  };
}

/**
 * Detect the URL type. Mirrors the SOURCE_TYPES enum.
 * @deprecated import from `@/lib/sourceTypes` instead.
 */
export { detectYouTubeSourceType } from "./sourceTypes";

/**
 * Pull metadata for a single video. Used for /sources of type youtube_video
 * and to enrich individual episode rows.
 */
export async function extractYouTubeMetadata(
  url: string,
): Promise<YouTubeVideo> {
  const out = await runYtDlp(["--no-playlist", "--dump-single-json", url]);
  const v = parseInfoLine(out.trim());
  if (!v) {
    throw new Error("yt-dlp returned no video metadata");
  }
  return v;
}

/**
 * Discover all videos for a channel/playlist. Uses --flat-playlist for speed,
 * then enriches each entry with --dump-json individually for accurate
 * duration/publish date.
 *
 * For very large channels, callers should paginate via `playlistEnd`.
 */
export async function syncYouTubeSource(
  sourceUrl: string,
  opts: { playlistEnd?: number } = {},
): Promise<YouTubeChannel> {
  const args = ["--flat-playlist", "--dump-json", sourceUrl];
  if (opts.playlistEnd) args.push("--playlist-end", String(opts.playlistEnd));

  const [profileResult, videoOut] = await Promise.allSettled([
    fetchYouTubeChannelProfile(sourceUrl),
    runYtDlp(args),
  ]);

  const profile =
    profileResult.status === "fulfilled" ? profileResult.value : null;
  if (profileResult.status === "rejected" && process.env.NODE_ENV !== "test") {
    console.warn(
      `[youtube] channel profile fetch failed for ${sourceUrl}: ${profileResult.reason?.message ?? profileResult.reason}`,
    );
  }

  if (videoOut.status === "rejected") {
    throw videoOut.reason;
  }

  const lines = videoOut.value.split("\n").filter(Boolean);
  const videos: YouTubeVideo[] = lines
    .map(parseInfoLine)
    .filter((v): v is YouTubeVideo => v !== null);

  const channelName =
    profile?.channelName ??
    videos.find((v) => v.channelName)?.channelName ??
    "Unknown channel";
  const channelId =
    profile?.channelId ??
    videos.find((v) => v.channelId)?.channelId ??
    slugify(channelName);

  return {
    channelId,
    channelName,
    description: profile?.description ?? null,
    thumbnailUrl: profile?.thumbnailUrl ?? null,
    channelUrl: profile?.channelUrl || sourceUrl,
    videos,
  };
}

/**
 * Build the metadata blob persisted to the `episodes` table.
 */
export function buildEpisodeMetadata(video: YouTubeVideo) {
  return {
    externalId: video.externalId,
    episodeTitle: video.title,
    sourceUrl: video.webUrl,
    sourcePlatform: "youtube" as const,
    publishDate: video.publishDate ? new Date(video.publishDate) : null,
    durationSeconds: video.durationSeconds,
    thumbnailOriginalUrl: video.thumbnailUrl,
  };
}

/**
 * Cache a thumbnail to local disk so episode pages don't depend on
 * youtube-thumbnail availability or change. Returns the local path.
 *
 * Idempotent: if the file already exists, returns the existing path.
 */
export async function cacheThumbnail(
  episodeId: string,
  thumbnailUrl: string,
): Promise<string> {
  ensureStorageDirs();
  const target = localPath("thumbnails", `${episodeId}.jpg`);
  if (fs.existsSync(target)) return target;
  try {
    await downloadToFile(thumbnailUrl, target);
    return target;
  } catch (err) {
    // Don't fail the pipeline just because a thumbnail couldn't be cached;
    // we still have `thumbnail_original_url` to fall back on.
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[youtube] thumbnail cache failed for ${episodeId}: ${(err as Error).message}`,
      );
    }
    return target;
  }
}

/**
 * Download audio to a local file via yt-dlp + ffmpeg.
 * Returns the audio file path.
 *
 * yt-dlp `--extract-audio` already runs ffmpeg under the hood, so the result
 * is a clean .mp3. For non-YouTube sources that arrive as raw video, see
 * `extractAudioIfNeeded` below.
 */
export async function downloadAudio(
  episodeId: string,
  sourceUrl: string,
  onProgress?: (percent: number) => void | Promise<void>,
): Promise<string> {
  ensureStorageDirs();
  const dir = path.dirname(localPath("audio", `${episodeId}.mp3`));
  const out = path.join(dir, `${episodeId}.%(ext)s`);

  await runYtDlp(
    [
      "-f",
      "bestaudio[ext=m4a]/bestaudio/best",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      out,
      sourceUrl,
    ],
    {
      onStderrLine: (line) => {
        const pct = parseYtDlpProgress(line);
        if (pct != null && onProgress) {
          void Promise.resolve(onProgress(pct));
        }
      },
    },
  );

  const finalPath = path.join(dir, `${episodeId}.mp3`);
  if (!fs.existsSync(finalPath)) {
    throw new Error(`Expected audio file at ${finalPath}, not found.`);
  }
  return finalPath;
}

/**
 * If a file is already audio (.mp3/.m4a/.wav/.opus), return its path
 * unchanged. Otherwise, run ffmpeg to extract a 16 kHz mono mp3 — matching
 * Whisper's expected input — and return the new path.
 *
 * Used by the `audio_extract` job for non-YouTube sources (manual upload,
 * future RSS w/ video enclosures, etc.). For YouTube, yt-dlp already did
 * the extraction in `downloadAudio`, so this is a no-op.
 */
export async function extractAudioIfNeeded(
  filePath: string,
): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio source file not found: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  if ([".mp3", ".m4a", ".wav", ".opus", ".flac"].includes(ext)) {
    return filePath;
  }

  const out = filePath.replace(/\.[^.]+$/, "") + ".mp3";
  if (fs.existsSync(out)) return out;

  await new Promise<void>((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-i", filePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", out],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("error", (e) =>
      reject(
        new Error(`ffmpeg failed to start. Is it installed? (${e.message})`),
      ),
    );
    ff.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `ffmpeg exited with code ${code}`));
        return;
      }
      resolve();
    });
  });

  return out;
}

// ─── Source CRUD helpers ───────────────────────────────────────────────────
// Pulled out of the API route so they can be reused from the CLI scripts.
//
// `createSource` upserts the parent podcast (idempotent by slug), creates
// the source row, and enqueues a `source_sync` processing job. Returns
// the source row.

export type CreateSourceArgs = {
  sourceUrl: string;
  sourceType?: SourceType;
  sourceName?: string;
  podcastId?: string;
  authRequired?: boolean;
};

export async function createSource(args: CreateSourceArgs) {
  const { hasDatabase, getDb } = await import("./db");
  if (!hasDatabase()) {
    throw new Error(
      "DATABASE_URL not set. Either configure Postgres or stay in demo mode.",
    );
  }
  const db = getDb();

  const sourceType = args.sourceType ?? detectSourceType(args.sourceUrl);
  const sourceName =
    args.sourceName ??
    (sourceType === "rss"
      ? deriveNameFromRssUrl(args.sourceUrl)
      : deriveNameFromUrl(args.sourceUrl));
  const slug = slugify(sourceName);

  let podcastId = args.podcastId;
  if (!podcastId) {
    const podcast = await db.podcast.upsert({
      where: { slug },
      update: {},
      create: {
        name: sourceName,
        slug,
        officialUrl: args.sourceUrl,
      },
    });
    podcastId = podcast.id;
  }

  const source = await db.source.create({
    data: {
      podcastId,
      sourceType,
      sourceName,
      sourceUrl: args.sourceUrl,
      authRequired: args.authRequired ?? false,
      syncStatus: "queued",
    },
  });

  // Enqueue the discovery job so a worker can pick it up. We don't run it
  // inline — long-running media work belongs in the worker.
  const { createProcessingJob } = await import("./queue");
  await createProcessingJob({ sourceId: source.id, jobType: "source_sync" });

  return source;
}

/**
 * Persist a single video's metadata as an `episodes` row. Upserts on the
 * (sourceId, externalId) unique pair so re-syncs don't create duplicates.
 *
 * Returns the persisted Prisma episode object.
 */
export async function saveEpisodeMetadata(args: {
  podcastId: string;
  sourceId: string;
  video: YouTubeVideo;
}) {
  const { getDb } = await import("./db");
  const db = getDb();
  const meta = buildEpisodeMetadata(args.video);
  return db.episode.upsert({
    where: {
      sourceId_externalId: {
        sourceId: args.sourceId,
        externalId: meta.externalId,
      },
    },
    update: meta,
    create: {
      ...meta,
      podcastId: args.podcastId,
      sourceId: args.sourceId,
    },
  });
}

export function deriveNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu")) {
      const handle = u.pathname.split("/").find((p) => p.startsWith("@"));
      if (handle) {
        return handle
          .slice(1)
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      const list = u.searchParams.get("list");
      if (list) return `Playlist ${list.slice(0, 8)}`;
      return "YouTube source";
    }
  } catch {
    // ignore
  }
  return "New podcast";
}
