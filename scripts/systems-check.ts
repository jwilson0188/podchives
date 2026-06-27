/**
 * Live systems check — sources, worker, queue, episode backlog.
 * Run: npx tsx scripts/systems-check.ts
 */
import { getDb } from "../lib/db";
import { isWorkerEnabled } from "../lib/workerControl";

async function main() {
  const db = getDb();

  const [sources, jobCounts, episodeCounts, workerEnabled, settings, lastRun, recentJobs, failedJobs] =
    await Promise.all([
      db.source.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          sourceName: true,
          autoSync: true,
          syncStatus: true,
          lastSyncedAt: true,
          _count: { select: { episodes: true } },
        },
      }),
      db.processingJob.groupBy({ by: ["status"], _count: true }),
      db.episode.groupBy({ by: ["isSearchable"], _count: true }),
      isWorkerEnabled(),
      db.schedulerSettings.findFirst(),
      db.workerRun.findFirst({ orderBy: { startedAt: "desc" } }),
      db.processingJob.findMany({
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          jobType: true,
          status: true,
          updatedAt: true,
          errorMessage: true,
        },
      }),
      db.processingJob.findMany({
        where: { status: "failed" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          jobType: true,
          errorMessage: true,
          updatedAt: true,
        },
      }),
    ]);

  const searchable =
    episodeCounts.find((e) => e.isSearchable === true)?._count ?? 0;
  const notSearchable =
    episodeCounts.find((e) => e.isSearchable === false)?._count ?? 0;

  console.log("\n=== PODCHIVES SYSTEMS CHECK ===\n");
  console.log("Worker enabled (DB switch):", workerEnabled ? "YES" : "PAUSED");
  console.log(
    "Last worker run:",
    lastRun
      ? `${lastRun.startedAt.toISOString()} · ${lastRun.status} · ${lastRun.jobsProcessed} jobs`
      : "none recorded",
  );
  console.log(
    "Episodes:",
    `${searchable} searchable / ${notSearchable} backlog / ${searchable + notSearchable} total`,
  );
  console.log("\nSources:");
  for (const s of sources) {
    console.log(
      `  • ${s.sourceName}: sync=${s.syncStatus} autoSync=${s.autoSync} episodes=${s._count.episodes} lastSync=${s.lastSyncedAt?.toISOString() ?? "never"}`,
    );
  }
  console.log("\nJob counts by status:");
  for (const j of jobCounts) {
    console.log(`  • ${j.status}: ${j._count}`);
  }
  if (failedJobs.length > 0) {
    console.log("\nRecent failures:");
    for (const f of failedJobs) {
      console.log(
        `  • ${f.jobType} @ ${f.updatedAt.toISOString()}: ${f.errorMessage?.slice(0, 120) ?? "?"}`,
      );
    }
  }
  console.log("\nRecent job activity:");
  for (const j of recentJobs) {
    console.log(
      `  • ${j.jobType} ${j.status} @ ${j.updatedAt.toISOString()}${j.errorMessage ? ` — ${j.errorMessage.slice(0, 80)}` : ""}`,
    );
  }
  const nightcap = sources.find((s) =>
    s.sourceName.toLowerCase().includes("nightcap"),
  );
  if (nightcap) {
    const ncJobs = await db.processingJob.groupBy({
      by: ["status", "jobType"],
      where: {
        OR: [
          { sourceId: nightcap.id },
          { episode: { sourceId: nightcap.id } },
        ],
      },
      _count: true,
    });
    const syncJobs = await db.processingJob.findMany({
      where: { sourceId: nightcap.id, jobType: "source_sync" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { status: true, errorMessage: true, createdAt: true },
    });
    console.log("\nNightcap job breakdown:", ncJobs);
    console.log("Nightcap source_sync history:", syncJobs);
  }

  const uiSample = await db.processingJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { status: true },
  });
  const uiActive = uiSample.filter(
    (j) => !["queued", "completed", "failed"].includes(j.status),
  );
  console.log(
    `\nUI queue window (200 newest jobs): ${uiActive.length} active, ${uiSample.filter((j) => j.status === "queued").length} queued in sample`,
  );

  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
