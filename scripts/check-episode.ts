import { getDb } from "../lib/db";

async function main() {
  const key = process.argv[2] ?? "WL6ueW2kDgg";
  const db = getDb();
  const ep = await db.episode.findFirst({
    where: {
      OR: [{ externalId: key }, { id: key }],
    },
    include: {
      processingJobs: { orderBy: { createdAt: "desc" }, take: 6 },
      _count: { select: { transcriptSegments: true } },
    },
  });
  if (!ep) {
    console.error("Episode not found");
    process.exit(1);
  }
  console.log({
    title: ep.episodeTitle,
    externalId: ep.externalId,
    processingStatus: ep.processingStatus,
    audioFilePath: ep.audioFilePath,
    isTranscribed: ep.isTranscribed,
    isEmbedded: ep.isEmbedded,
    isSearchable: ep.isSearchable,
    segmentCount: ep._count.transcriptSegments,
    recentJobs: ep.processingJobs.map((j) => ({
      type: j.jobType,
      status: j.status,
      error: j.errorMessage?.slice(0, 80) ?? null,
    })),
  });
  await db.$disconnect();
}

main();
