import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const stuck = await db.processingJob.findMany({
    where: {
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
    select: { id: true, jobType: true, episodeId: true, updatedAt: true },
  });

  if (stuck.length === 0) {
    console.log("No stuck jobs.");
    await db.$disconnect();
    return;
  }

  const result = await db.processingJob.updateMany({
    where: { id: { in: stuck.map((j) => j.id) } },
    data: { status: "queued", workerId: null, errorMessage: null },
  });

  console.log(`Reset ${result.count} stuck jobs:`, stuck);
  await db.$disconnect();
}

main();
