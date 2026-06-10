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

// Prisma loads .env (OPENAI_API_KEY, DATABASE_URL, etc.) on first connect.
getDb();

const POLL_INTERVAL_MS = 5_000;
let running = true;

async function loop() {
  while (running) {
    try {
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
loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
