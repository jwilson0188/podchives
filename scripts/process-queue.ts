/**
 * One-shot queue drain. Runs all queued jobs (up to MAX_JOBS_PER_RUN), then exits.
 *
 * npm run process-queue
 */
import { runOnce } from "../workers/scheduler";

(async () => {
  const results = await runOnce();
  console.log(`Processed ${results.length} job(s):`);
  for (const r of results) {
    console.log(`  - ${r.jobType}: ${r.status}${r.error ? ` — ${r.error}` : ""}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
