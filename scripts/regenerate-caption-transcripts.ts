/**
 * Re-transcribe episodes whose transcripts came from YouTube captions before
 * the rolling-caption dedupe landed (see lib/youtubeCaptions.ts).
 *
 * Those transcripts contain roughly 65% duplicated text, which also went into
 * their embeddings — so both keyword and semantic search are degraded for them.
 *
 *   npx tsx scripts/regenerate-caption-transcripts.ts           # dry run
 *   npx tsx scripts/regenerate-caption-transcripts.ts --apply   # queue the work
 *
 * Re-fetching captions costs a couple of seconds per episode and re-embedding
 * costs cents, so this is cheap to redo. It queues jobs; a worker does the work.
 */

const SUPERSEDED = "superseded: caption transcript regenerated";

async function main() {
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg >= 0 ? Math.max(1, parseInt(process.argv[limitArg + 1] ?? "0", 10)) : 0;

  const { hasDatabase, getDb } = await import("../lib/db");
  if (!hasDatabase()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = getDb();

  // Episodes whose stored transcript came from captions.
  const rows = await db.$queryRawUnsafe<{ episode_id: string; segs: number }[]>(
    `SELECT episode_id, count(*)::int AS segs
     FROM transcript_segments
     WHERE transcript_source_type = 'youtube_captions'
     GROUP BY episode_id
     ORDER BY count(*) DESC
     ${limit ? `LIMIT ${limit}` : ""}`,
  );

  if (rows.length === 0) {
    console.log("No caption-derived transcripts found. Nothing to do.");
    return;
  }

  const ids = rows.map((r) => r.episode_id);
  const totalSegs = rows.reduce((a, r) => a + r.segs, 0);

  console.log(`\nEpisodes with caption transcripts: ${rows.length}`);
  console.log(`Segments to be replaced:            ${totalSegs}`);

  if (!apply) {
    console.log(
      "\nDry run. Re-run with --apply to queue regeneration." +
        "\nNothing has been changed.",
    );
    return;
  }

  // 1. Old completed pipeline jobs would block re-enqueueing: enqueueNextPipelineJob
  //    treats a completed job with a null errorMessage as "already done". Stamping
  //    a message keeps the history but lets the chain rebuild.
  const unblocked = await db.processingJob.updateMany({
    where: {
      episodeId: { in: ids },
      status: "completed",
      errorMessage: null,
      jobType: {
        in: ["transcription", "transcript_segmentation", "embedding", "indexing"],
      },
    },
    data: { errorMessage: SUPERSEDED },
  });
  console.log(`\nUnblocked ${unblocked.count} previously-completed pipeline jobs`);

  // 2. Clear the flags so the episode is not treated as finished mid-rebuild.
  //    Transcript rows themselves are replaced by saveTranscriptSegments(replace:true),
  //    so they are deliberately left in place until the new text is ready.
  const reset = await db.episode.updateMany({
    where: { id: { in: ids } },
    data: {
      isSearchable: false,
      isEmbedded: false,
      isTranscribed: false,
      processingStatus: "queued",
    },
  });
  console.log(`Reset ${reset.count} episodes to unprocessed`);

  // 3. Queue transcription directly. Not queueEpisodeProcessingIfNeeded — that
  //    skips episodes which already have audio, and it would route some of these
  //    down the download path unnecessarily when captions are what we want.
  const { createProcessingJob } = await import("../lib/queue");
  let queued = 0;
  for (const id of ids) {
    const active = await db.processingJob.findFirst({
      where: { episodeId: id, jobType: "transcription", status: "queued" },
      select: { id: true },
    });
    if (active) continue;
    await createProcessingJob({ episodeId: id, jobType: "transcription" });
    queued++;
  }
  console.log(`Queued ${queued} transcription jobs`);
  console.log("\nStart a worker to process them:  npm run worker");
}

main()
  .catch((err) => {
    console.error("\nFailed:", err.message);
    process.exit(1);
  })
  .then(() => process.exit(0));

// Marks this file a module so its top-level names stay scoped to it.
export {};
