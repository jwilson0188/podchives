/**
 * Storage abstraction.
 *
 * MVP: local filesystem under ./storage/{audio,thumbnails,transcripts}.
 * Later: swap in Supabase Storage / S3 by reading process.env.STORAGE_BUCKET.
 *
 * All functions return paths or URLs — never streams — so callers can
 * persist them directly into the DB.
 */
import fs from "node:fs";
import path from "node:path";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

export const STORAGE_DIRS = {
  audio: path.join(STORAGE_ROOT, "audio"),
  video: path.join(STORAGE_ROOT, "video"),
  thumbnails: path.join(STORAGE_ROOT, "thumbnails"),
  transcripts: path.join(STORAGE_ROOT, "transcripts"),
} as const;

export type StorageBucket = keyof typeof STORAGE_DIRS;

export function ensureStorageDirs(): void {
  for (const dir of Object.values(STORAGE_DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function localPath(bucket: StorageBucket, filename: string): string {
  ensureStorageDirs();
  return path.join(STORAGE_DIRS[bucket], filename);
}

export function fileExists(p: string): boolean {
  return fs.existsSync(p);
}

export async function downloadToFile(
  url: string,
  localPath: string,
): Promise<string> {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Download failed: ${res.status} ${res.statusText} — ${url}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buf);
  return localPath;
}

/**
 * TODO(Phase-2): swap to Supabase Storage / S3.
 *
 * export async function uploadToBucket(localPath: string, key: string) {
 *   const bucket = process.env.STORAGE_BUCKET;
 *   if (!bucket) return localPath; // fall back to local
 *   // supabase.storage.from(bucket).upload(key, fs.readFileSync(localPath))
 * }
 */

export function fileSizeBytes(p: string): number {
  if (!fs.existsSync(p)) return 0;
  return fs.statSync(p).size;
}
