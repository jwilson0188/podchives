/**
 * Recover from a bulk 403 failure (e.g. 300+ failed download jobs).
 *
 * Usage:
 *   npx tsx scripts/recover-queue.ts              # report only
 *   npx tsx scripts/recover-queue.ts --reset      # fix bogus episode flags + cancel junk jobs
 *   npx tsx scripts/recover-queue.ts --queue 1    # re-queue download for 1 episode (test)
 *   npx tsx scripts/recover-queue.ts --queue 5    # re-queue download for 5 episodes
 *   npx tsx scripts/recover-queue.ts --queue all  # queue download for every episode missing audio
 *
 * BEFORE running --queue:
 *   1. Fix YouTube cookies in .env (YOUTUBE_COOKIES_FROM_BROWSER=chrome or YOUTUBE_COOKIES_FILE)
 *   2. Restart worker: npm run worker
 */
import { PROCESSING_ORDER } from "../lib/constants";

async function main() {
  const args = process.argv.slice(2);
  const doReset = args.includes("--reset");
  const queueIdx = args.indexOf("--queue");
  const queueArg = queueIdx >= 0 ? (args[queueIdx + 1] ?? "1") : "";
  const queueAll = queueArg.toLowerCase() === "all";
  const queueLimit =
    queueIdx >= 0 && !queueAll
      ? Math.max(1, parseInt(queueArg, 10) || 1)
      : queueAll
        ? 0
        : 0;

  const { hasDatabase, getDb } = await import("../lib/db");
  if (!hasDatabase()) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }
  const db = getDb();

  // Sequential queries — Supabase session pooler caps concurrent connections.
  const episodeCount = await db.episode.count();
  const withAudio = await db.episode.count({
    where: { audioFilePath: { not: null } },
  });
  const searchable = await db.episode.count({
    where: { isSearchable: true },
  });
  const transcribed = await db.episode.count({
    where: { isTranscribed: true },
  });
  const failedJobs = await db.processingJob.count({
    where: { status: "failed" },
  });
  const queuedJobs = await db.processingJob.count({
    where: { status: "queued" },
  });
  const failedByType = await db.processingJob.groupBy({
    by: ["jobType"],
    where: { status: "failed" },
    _count: true,
  });

  console.log("\n── Queue health ──");
  console.log(`  Episodes:              ${episodeCount}`);
  console.log(`  With audio downloaded: ${withAudio}`);
  console.log(`  Marked transcribed:    ${transcribed}`);
  console.log(`  Marked searchable:     ${searchable}`);
  console.log(`  Failed jobs:           ${failedJobs}`);
  console.log(`  Queued jobs:           ${queuedJobs}`);
  console.log("\n── Failed jobs by type ──");
  for (const row of failedByType.sort((a, b) => b._count - a._count)) {
    console.log(`  ${row.jobType.padEnd(24)} ${row._count}`);
  }

  const cookiesFile = process.env.YOUTUBE_COOKIES_FILE;
  const cookiesBrowser = process.env.YOUTUBE_COOKIES_FROM_BROWSER;
  console.log("\n── YouTube cookies ──");
  if (cookiesFile) {
    const { existsSync } = await import("fs");
    console.log(
      `  YOUTUBE_COOKIES_FILE=${cookiesFile} (${existsSync(cookiesFile) ? "found" : "MISSING"})`,
    );
  } else if (cookiesBrowser) {
    console.log(`  YOUTUBE_COOKIES_FROM_BROWSER=${cookiesBrowser}`);
  } else {
    console.log("  ⚠ No cookies configured — downloads will likely fail with bot check");
  }

  if (!doReset && queueLimit === 0 && !queueAll) {
    console.log("\nNext steps:");
    console.log("  1. Fix cookies in .env, restart worker");
    console.log("  2. npx tsx scripts/recover-queue.ts --reset");
    console.log("  3. npx tsx scripts/recover-queue.ts --queue 1   # test one episode");
    console.log("  4. When that works: --queue 5, then let worker run overnight");
    await db.$disconnect();
    return;
  }

  if (doReset) {
    console.log("\n── Resetting bogus state ──");

    // Episodes with no audio should not be transcribed/searchable.
    const epReset = await db.episode.updateMany({
      where: { audioFilePath: null },
      data: {
        isSearchable: false,
        isTranscribed: false,
        isEmbedded: false,
        transcriptStatus: "queued",
        embeddingStatus: "queued",
        processingStatus: "queued",
      },
    });
    console.log(`  Reset ${epReset.count} episodes (no audio)`);

    // Cancel failed downstream jobs for episodes still missing audio.
    const cancelDownstream = await db.processingJob.updateMany({
      where: {
        status: "failed",
        jobType: {
          in: [
            "audio_extract",
            "transcription",
            "transcript_segmentation",
            "embedding",
            "indexing",
          ],
        },
        episode: { audioFilePath: null },
      },
      data: {
        status: "completed",
        progressPercent: 0,
        errorMessage: "cancelled: download never succeeded",
        completedAt: new Date(),
      },
    });
    console.log(`  Cancelled ${cancelDownstream.count} bogus downstream failed jobs`);

    // Mark falsely-completed downstream jobs the same way.
    const cancelFalseComplete = await db.processingJob.updateMany({
      where: {
        status: "completed",
        jobType: {
          in: [
            "transcription",
            "transcript_segmentation",
            "embedding",
            "indexing",
          ],
        },
        episode: { audioFilePath: null },
      },
      data: {
        status: "completed",
        progressPercent: 0,
        errorMessage: "cancelled: no audio was ever downloaded",
        completedAt: new Date(),
      },
    });
    console.log(`  Annotated ${cancelFalseComplete.count} false-complete downstream jobs`);

    // Re-queue failed download jobs back to queued (ready for retry after cookies fix).
    const requeueDownloads = await db.processingJob.updateMany({
      where: {
        status: "failed",
        jobType: "download",
        episode: { audioFilePath: null },
      },
      data: {
        status: "queued",
        progressPercent: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        workerId: null,
      },
    });
    console.log(`  Re-queued ${requeueDownloads.count} failed download jobs`);

    // Clear queued downstream jobs for episodes without audio (prevent worker spam).
    const clearQueuedDownstream = await db.processingJob.updateMany({
      where: {
        status: "queued",
        jobType: { notIn: ["download", "thumbnail_cache", "source_sync"] },
        episode: { audioFilePath: null },
      },
      data: {
        status: "completed",
        progressPercent: 0,
        errorMessage: "cancelled: waiting for download",
        completedAt: new Date(),
      },
    });
    console.log(`  Cleared ${clearQueuedDownstream.count} queued downstream jobs (no audio yet)`);

    const missingDownload = await db.episode.findMany({
      where: {
        audioFilePath: null,
        processingJobs: {
          none: {
            jobType: "download",
            status: { in: ["queued", "running", "downloading", "failed"] },
          },
        },
      },
      select: { id: true },
    });
    if (missingDownload.length > 0) {
      const { createProcessingJob } = await import("../lib/queue");
      for (const ep of missingDownload) {
        await createProcessingJob({ episodeId: ep.id, jobType: "download" });
      }
      console.log(
        `  Created ${missingDownload.length} missing download jobs`,
      );
    }

    const { enqueueNextPipelineJob } = await import("../lib/queue");
    const stalledWithAudio = await db.episode.findMany({
      where: {
        audioFilePath: { not: null },
        isSearchable: false,
        processingJobs: {
          none: {
            status: { in: ["queued", ...["running", "downloading", "transcribing", "segmenting", "embedding", "indexing", "extracting_audio"]] },
          },
        },
      },
      select: { id: true, episodeTitle: true },
    });
    let requeuedPipeline = 0;
    for (const ep of stalledWithAudio) {
      const lastDownload = await db.processingJob.findFirst({
        where: { episodeId: ep.id, jobType: "download", status: "completed", errorMessage: null },
        orderBy: { completedAt: "desc" },
      });
      if (lastDownload && (await enqueueNextPipelineJob(ep.id, "download"))) {
        requeuedPipeline++;
      }
    }
    if (requeuedPipeline > 0) {
      console.log(
        `  Re-queued downstream pipeline for ${requeuedPipeline} episode(s) with audio`,
      );
    }
  }

  if (queueLimit > 0 || queueAll) {
    const { createProcessingJob } = await import("../lib/queue");

    const episodes = await db.episode.findMany({
      where: { audioFilePath: null },
      orderBy: { publishDate: "desc" },
      ...(queueAll ? {} : { take: queueLimit }),
      select: { id: true, episodeTitle: true },
    });

    console.log(`\n── Queueing pipeline for ${episodes.length} episode(s) ──`);
    for (const ep of episodes) {
      // Only queue if no active download job exists.
      const existingDl = await db.processingJob.findFirst({
        where: {
          episodeId: ep.id,
          jobType: "download",
          status: { in: ["queued", "running", "downloading"] },
        },
      });
      if (!existingDl) {
        await createProcessingJob({ episodeId: ep.id, jobType: "download" });
      }
      // Ensure full pipeline exists after download succeeds — worker will pick up
      // transcription etc. only when prior steps complete. For now just download.
      console.log(`  → ${ep.episodeTitle.slice(0, 60)}`);
    }
    console.log(
      "\nWorker will process download jobs one at a time. Watch /processing-queue.",
    );
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
