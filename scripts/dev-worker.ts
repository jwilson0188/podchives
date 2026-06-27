/**
 * Local dev worker — drains the queue every N seconds.
 *
 * Run with:  npm run worker
 *
 * Stops gracefully on SIGINT/SIGTERM.
 */
import "tsx/esm/api";
import { getDb } from "../lib/db";
import { processUntilEmpty } from "../workers/processingWorker";
import { enqueueDueSourceSyncs } from "../lib/queue";

// Prisma loads .env (OPENAI_API_KEY, DATABASE_URL, etc.) on first connect.
getDb();

const POLL_INTERVAL_MS = 5_000;

// Auto-sync: periodically re-sync every source so new uploads get ingested and
// any backlog stragglers get re-queued. Disable with AUTO_SYNC_ENABLED=false.
const AUTO_SYNC_ENABLED =
  (process.env.AUTO_SYNC_ENABLED ?? "true").toLowerCase() !== "false";
const AUTO_SYNC_INTERVAL_MIN =
  Number(process.env.AUTO_SYNC_INTERVAL_MINUTES) || 360; // default: every 6h
const SYNC_CHECK_MS = 60_000; // don't hit the DB for due-syncs more than 1×/min

let running = true;
let lastSyncCheck = 0;

async function maybeAutoSync() {
  if (!AUTO_SYNC_ENABLED) return;
  if (Date.now() - lastSyncCheck < SYNC_CHECK_MS) return;
  lastSyncCheck = Date.now();
  try {
    const n = await enqueueDueSourceSyncs(AUTO_SYNC_INTERVAL_MIN);
    if (n > 0) {
      console.log(`[dev-worker] auto-sync: queued ${n} source(s) for re-sync`);
    }
  } catch (err) {
    console.error("[dev-worker] auto-sync check failed", err);
  }
}

async function loop() {
  while (running) {
    try {
      await maybeAutoSync();
      const results = await processUntilEmpty({ maxJobs: 1 });
      if (results.length === 0) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error("[dev-worker] error", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  console.log("[dev-worker] shut down cleanly.");
}

process.on("SIGINT", () => {
  console.log("\n[dev-worker] SIGINT — finishing current job…");
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});

console.log("[dev-worker] polling for queued jobs (Ctrl+C to stop)…");
console.log(
  AUTO_SYNC_ENABLED
    ? `[dev-worker] auto-sync ON — re-syncing sources every ${AUTO_SYNC_INTERVAL_MIN}m`
    : "[dev-worker] auto-sync OFF",
);
loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
