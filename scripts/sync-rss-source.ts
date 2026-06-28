/**
 * One-shot: add an RSS source and immediately sync it.
 *
 * Usage:
 *   tsx scripts/sync-rss-source.ts <feed-url> [--name "Show name"] [--podcast-slug nightcap]
 *   tsx scripts/sync-rss-source.ts --nightcap
 */
import { detectSourceType } from "../lib/sourceTypes";
import { runSourceSyncJob } from "../workers/sourceSyncWorker";
import { createProcessingJob } from "../lib/queue";
import { fetchRssFeed, NIGHTCAP_RSS_URL } from "../lib/rss";

async function main() {
  const args = process.argv.slice(2);
  const url = args[0] === "--nightcap" ? NIGHTCAP_RSS_URL : args[0];
  if (!url) {
    console.error(
      "Usage: tsx scripts/sync-rss-source.ts <feed-url> [--name <name>] [--podcast-slug <slug>]",
    );
    console.error("       tsx scripts/sync-rss-source.ts --nightcap");
    process.exit(1);
  }

  const nameIdx = args.indexOf("--name");
  const slugIdx = args.indexOf("--podcast-slug");
  const slug =
    slugIdx >= 0
      ? args[slugIdx + 1]
      : args[0] === "--nightcap"
        ? "nightcapshow"
        : undefined;

  const { hasDatabase, getDb } = await import("../lib/db");
  if (!hasDatabase()) {
    console.error(
      "DATABASE_URL is not set. Set it in .env before running this script.",
    );
    process.exit(1);
  }
  const db = getDb();

  const feed = await fetchRssFeed(url);
  const name =
    nameIdx >= 0 ? args[nameIdx + 1]! : feed.title || "RSS podcast";

  let podcastId: string;
  if (slug) {
    const podcast = await db.podcast.findUnique({ where: { slug } });
    if (!podcast) {
      console.error(`No podcast found with slug "${slug}"`);
      process.exit(1);
    }
    podcastId = podcast.id;
  } else {
    const podcastSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const podcast = await db.podcast.upsert({
      where: { slug: podcastSlug },
      update: {},
      create: {
        name,
        slug: podcastSlug,
        officialUrl: feed.link ?? url,
        coverImageUrl: feed.imageUrl ?? undefined,
        description: feed.description ?? undefined,
      },
    });
    podcastId = podcast.id;
  }

  const existing = await db.source.findFirst({
    where: { podcastId, sourceUrl: url },
  });
  if (existing) {
    console.log(`RSS source already exists (${existing.id}) — syncing now`);
    const job = await createProcessingJob({
      sourceId: existing.id,
      jobType: "source_sync",
    });
    const summary = await runSourceSyncJob(job.id, existing.id);
    console.log("Sync complete.", summary);
    return;
  }

  const source = await db.source.create({
    data: {
      podcastId,
      sourceType: detectSourceType(url),
      sourceName: `${name} (RSS)`,
      sourceUrl: url,
      authRequired: false,
      syncStatus: "queued",
    },
  });

  console.log(
    `Created RSS source ${source.id} for ${name} (${feed.items.length} episodes in feed)`,
  );

  const job = await createProcessingJob({
    sourceId: source.id,
    jobType: "source_sync",
  });

  console.log(`Running source_sync job ${job.id}…`);
  const summary = await runSourceSyncJob(job.id, source.id);
  console.log("Sync complete.", summary);
}

const isDirectRun = process.argv[1]?.includes("sync-rss-source");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
