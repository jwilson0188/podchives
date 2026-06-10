/**
 * Queue processing jobs for one episode by YouTube video id or episode cuid.
 * Usage:
 *   npx tsx scripts/queue-episode.ts WL6ueW2kDgg
 *   npx tsx scripts/queue-episode.ts WL6ueW2kDgg --from transcription
 */
import type { JobType } from "../lib/constants";
import { createProcessingJob } from "../lib/queue";

const PIPELINE_FROM: Record<string, JobType[]> = {
  download: [
    "download",
    "audio_extract",
    "transcription",
    "transcript_segmentation",
    "embedding",
    "indexing",
  ],
  transcription: [
    "transcription",
    "transcript_segmentation",
    "embedding",
    "indexing",
  ],
};

async function main() {
  const key = process.argv[2];
  const fromFlag = process.argv.indexOf("--from");
  const from =
    fromFlag >= 0 ? (process.argv[fromFlag + 1] ?? "download") : "download";
  const steps = PIPELINE_FROM[from];
  if (!key || !steps) {
    console.error(
      "Usage: npx tsx scripts/queue-episode.ts <id> [--from download|transcription]",
    );
    process.exit(1);
  }

  const { getDb } = await import("../lib/db");
  const db = getDb();

  const ep = await db.episode.findFirst({
    where: {
      OR: [{ id: key }, { externalId: key }, { sourceUrl: { contains: key } }],
    },
  });
  if (!ep) {
    console.error(`No episode found for: ${key}`);
    process.exit(1);
  }

  if (from === "transcription" && !ep.audioFilePath) {
    console.error("Episode has no audio — queue from download instead.");
    process.exit(1);
  }

  await db.episode.update({
    where: { id: ep.id },
    data: {
      processingStatus: from === "download" ? "queued" : ep.processingStatus,
      transcriptStatus: "queued",
      embeddingStatus: "queued",
      isSearchable: false,
      isTranscribed: false,
      isEmbedded: false,
    },
  });

  // Drop stale queued downstream jobs so they don't race ahead of earlier steps.
  await db.processingJob.deleteMany({
    where: {
      episodeId: ep.id,
      jobType: { in: steps },
      status: "queued",
    },
  });

  for (const jobType of steps) {
    const existing = await db.processingJob.findFirst({
      where: {
        episodeId: ep.id,
        jobType,
        status: {
          in: [
            "running",
            "downloading",
            "transcribing",
            "embedding",
            "indexing",
            "segmenting",
          ],
        },
      },
    });
    if (existing) {
      console.log(`${jobType} already active: ${existing.id}`);
      continue;
    }
    const job = await createProcessingJob({ episodeId: ep.id, jobType });
    console.log(`Queued ${jobType} ${job.id}`);
  }

  console.log(`Pipeline queued for: ${ep.episodeTitle}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
