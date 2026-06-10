import { getDb } from "../lib/db";

async function main() {
  const db = getDb();

  const recent = await db.processingJob.findMany({
    where: { jobType: "download", status: "completed" },
    orderBy: { completedAt: "desc" },
    take: 5,
    include: { episode: { select: { episodeTitle: true, externalId: true, audioFilePath: true, isSearchable: true } } },
  });

  const searchable = await db.episode.findMany({
    where: { isSearchable: true },
    select: { episodeTitle: true, externalId: true, audioFilePath: true },
    take: 10,
  });

  const withAudio = await db.episode.count({ where: { audioFilePath: { not: null } } });

  console.log({ episodesWithAudio: withAudio, searchableCount: searchable.length });
  console.log("Recent completed downloads:", recent.map((j) => ({
    episode: j.episode?.episodeTitle,
    externalId: j.episode?.externalId,
    audio: j.episode?.audioFilePath?.slice(-40),
    searchable: j.episode?.isSearchable,
    completedAt: j.completedAt,
  })));
  console.log("Searchable episodes:", searchable);

  await db.$disconnect();
}

main();
