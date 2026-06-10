/**
 * Seed demo data into a real database. Useful for clicking around with
 * the worker UI without running yt-dlp/Whisper.
 *
 * Run AFTER `prisma db push` and AFTER setting DATABASE_URL.
 *
 *   npm run seed
 */
import {
  demoPodcasts,
  demoSources,
  demoEpisodes,
  demoTranscriptSegments,
  demoProcessingJobs,
  demoDownloads,
} from "../lib/demoData";

async function main() {
  const { hasDatabase, getDb } = await import("../lib/db");
  if (!hasDatabase()) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }
  const db = getDb();

  console.log("Seeding podcasts…");
  for (const p of demoPodcasts) {
    await db.podcast.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        officialUrl: p.officialUrl,
      },
      create: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        officialUrl: p.officialUrl,
      },
    });
  }

  console.log("Seeding sources…");
  for (const s of demoSources) {
    await db.source.upsert({
      where: { id: s.id },
      update: {
        sourceType: s.sourceType,
        sourceName: s.sourceName,
        sourceUrl: s.sourceUrl,
        authRequired: s.authRequired,
        lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt) : null,
        syncStatus: s.syncStatus,
      },
      create: {
        id: s.id,
        podcastId: s.podcastId,
        sourceType: s.sourceType,
        sourceName: s.sourceName,
        sourceUrl: s.sourceUrl,
        authRequired: s.authRequired,
        lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt) : null,
        syncStatus: s.syncStatus,
      },
    });
  }

  console.log("Seeding episodes…");
  for (const e of demoEpisodes) {
    await db.episode.upsert({
      where: { id: e.id },
      update: {
        episodeTitle: e.episodeTitle,
        episodeNumber: e.episodeNumber,
        sourceUrl: e.sourceUrl,
        sourcePlatform: e.sourcePlatform,
        publishDate: new Date(e.publishDate),
        durationSeconds: e.durationSeconds,
        thumbnailOriginalUrl: e.thumbnailUrl,
        transcriptStatus: e.transcriptStatus,
        embeddingStatus: e.embeddingStatus,
        processingStatus: e.processingStatus,
        isSearchable: e.isSearchable,
        isTranscribed: e.isTranscribed,
        isEmbedded: e.isEmbedded,
      },
      create: {
        id: e.id,
        podcastId: e.podcastId,
        sourceId: e.sourceId,
        externalId: e.externalId,
        episodeTitle: e.episodeTitle,
        episodeNumber: e.episodeNumber,
        sourceUrl: e.sourceUrl,
        sourcePlatform: e.sourcePlatform,
        publishDate: new Date(e.publishDate),
        durationSeconds: e.durationSeconds,
        thumbnailOriginalUrl: e.thumbnailUrl,
        transcriptStatus: e.transcriptStatus,
        embeddingStatus: e.embeddingStatus,
        processingStatus: e.processingStatus,
        isSearchable: e.isSearchable,
        isTranscribed: e.isTranscribed,
        isEmbedded: e.isEmbedded,
      },
    });
  }

  console.log("Seeding transcript segments…");
  for (const s of demoTranscriptSegments) {
    await db.transcriptSegment.upsert({
      where: { id: s.id },
      update: {
        startTimeSeconds: s.startTimeSeconds,
        endTimeSeconds: s.endTimeSeconds,
        transcriptText: s.transcriptText,
        confidenceScore: s.confidenceScore,
        sourceUrl: s.sourceUrl,
        sourcePlatform: s.sourcePlatform,
        transcriptSourceType: s.transcriptSourceType,
      },
      create: {
        id: s.id,
        episodeId: s.episodeId,
        podcastId: s.podcastId,
        startTimeSeconds: s.startTimeSeconds,
        endTimeSeconds: s.endTimeSeconds,
        transcriptText: s.transcriptText,
        confidenceScore: s.confidenceScore,
        sourceUrl: s.sourceUrl,
        sourcePlatform: s.sourcePlatform,
        transcriptSourceType: s.transcriptSourceType,
      },
    });
  }

  console.log("Seeding processing jobs…");
  for (const j of demoProcessingJobs) {
    await db.processingJob.upsert({
      where: { id: j.id },
      update: {
        jobType: j.jobType,
        status: j.status,
        progressPercent: j.progressPercent,
        workerId: j.workerId,
        startedAt: j.startedAt ? new Date(j.startedAt) : null,
        completedAt: j.completedAt ? new Date(j.completedAt) : null,
        retryCount: j.retryCount,
        errorMessage: j.errorMessage,
      },
      create: {
        id: j.id,
        episodeId: j.episodeId,
        jobType: j.jobType,
        status: j.status,
        progressPercent: j.progressPercent,
        workerId: j.workerId,
        startedAt: j.startedAt ? new Date(j.startedAt) : null,
        completedAt: j.completedAt ? new Date(j.completedAt) : null,
        retryCount: j.retryCount,
        errorMessage: j.errorMessage,
        createdAt: new Date(j.createdAt),
      },
    });
  }

  console.log("Seeding downloads…");
  for (const d of demoDownloads) {
    const ep = demoEpisodes.find((e) => e.id === d.episodeId);
    if (!ep) continue;
    await db.download.upsert({
      where: { id: d.id },
      update: {
        downloadType: d.downloadType,
        status: d.status,
        progressPercent: d.progressPercent,
        startedAt: d.startedAt ? new Date(d.startedAt) : null,
        completedAt: d.completedAt ? new Date(d.completedAt) : null,
        errorMessage: d.errorMessage,
        filePath: d.filePath,
      },
      create: {
        id: d.id,
        sourceId: ep.sourceId,
        episodeId: d.episodeId,
        downloadType: d.downloadType,
        status: d.status,
        progressPercent: d.progressPercent,
        startedAt: d.startedAt ? new Date(d.startedAt) : null,
        completedAt: d.completedAt ? new Date(d.completedAt) : null,
        errorMessage: d.errorMessage,
        filePath: d.filePath,
      },
    });
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { getDb, hasDatabase } = await import("../lib/db");
    if (hasDatabase()) await getDb().$disconnect();
  });
