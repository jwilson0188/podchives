/**
 * One-shot: add a YouTube source and immediately sync it.
 *
 * Usage:
 *   tsx scripts/sync-youtube-source.ts <url> [--name "Show name"]
 */
import { detectYouTubeSourceType } from "../lib/youtube";
import { runSourceSyncJob } from "../workers/sourceSyncWorker";
import { createProcessingJob } from "../lib/queue";

async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  if (!url) {
    console.error("Usage: tsx scripts/sync-youtube-source.ts <url> [--name <name>]");
    process.exit(1);
  }
  const nameIdx = args.indexOf("--name");
  const name =
    nameIdx >= 0 ? args[nameIdx + 1] : deriveName(url);

  const { hasDatabase, getDb } = await import("../lib/db");
  if (!hasDatabase()) {
    console.error(
      "DATABASE_URL is not set. Set it in .env before running this script.",
    );
    process.exit(1);
  }
  const db = getDb();

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const podcast = await db.podcast.upsert({
    where: { slug },
    update: {},
    create: { name, slug, officialUrl: url },
  });

  const sourceType = detectYouTubeSourceType(url);
  const source = await db.source.create({
    data: {
      podcastId: podcast.id,
      sourceType,
      sourceName: name,
      sourceUrl: url,
      authRequired: false,
      syncStatus: "queued",
    },
  });

  console.log(`Created source ${source.id} for ${name}`);

  const job = await createProcessingJob({
    sourceId: source.id,
    jobType: "source_sync",
  });

  console.log(`Running source_sync job ${job.id}…`);
  const summary = await runSourceSyncJob(job.id, source.id);
  console.log("Sync complete.", summary);
}

function deriveName(url: string): string {
  try {
    const u = new URL(url);
    const handle = u.pathname.split("/").find((p) => p.startsWith("@"));
    if (handle) return handle.slice(1).replace(/[-_]/g, " ");
    const list = u.searchParams.get("list");
    if (list) return `Playlist ${list.slice(0, 10)}`;
    return "YouTube source";
  } catch {
    return "YouTube source";
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
