/**
 * Scheduler — overnight processing.
 *
 * Reads scheduler_settings (or env vars) and runs the worker pool
 * inside a window. Designed to be invoked from cron / a Render background
 * worker — *not* from the Next.js process.
 *
 * Usage (local):
 *   tsx scripts/process-queue.ts                  # one-shot drain
 *   OVERNIGHT_PROCESSING_ENABLED=true tsx workers/scheduler.ts  # daemon
 *
 * Usage (cron):
 *   0 2 * * *   cd /app && npm run process-queue
 */
import { processUntilEmpty } from "./processingWorker";

export type SchedulerOptions = {
  overnightEnabled: boolean;
  startTime: string; // HH:MM 24h
  maxJobsPerRun: number;
  retryFailedJobs: boolean;
  concurrentWorkers: number;
};

export function readSchedulerOptions(): SchedulerOptions {
  return {
    overnightEnabled:
      (process.env.OVERNIGHT_PROCESSING_ENABLED ?? "false").toLowerCase() ===
      "true",
    startTime: process.env.OVERNIGHT_START_TIME ?? "02:00",
    maxJobsPerRun: parseInt(process.env.MAX_JOBS_PER_RUN ?? "3", 10) || 3,
    retryFailedJobs: true,
    concurrentWorkers: 1,
  };
}

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return { h: h || 0, m: m || 0 };
}

function msUntil(targetHour: number, targetMinute: number): number {
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    targetHour,
    targetMinute,
    0,
    0,
  );
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

/**
 * Read scheduler settings from the DB if present, otherwise fall back to
 * env vars. The DB row wins so users can change settings live from the
 * Settings page (Phase 6+).
 */
export async function loadSchedulerSettings(): Promise<SchedulerOptions> {
  const fromEnv = readSchedulerOptions();
  try {
    const { hasDatabase, getDb } = await import("@/lib/db");
    if (!hasDatabase()) return fromEnv;
    const db = getDb();
    const row = await db.schedulerSettings.findFirst();
    if (!row) return fromEnv;
    return {
      overnightEnabled: row.overnightEnabled,
      startTime: row.startTime,
      maxJobsPerRun: row.maxJobsPerRun,
      retryFailedJobs: row.retryFailedJobs,
      concurrentWorkers: row.concurrentWorkers,
    };
  } catch {
    return fromEnv;
  }
}

/**
 * Run the queue once, with optional auto-retry of failed jobs.
 */
export async function runOnce(opts?: Partial<SchedulerOptions>) {
  const cfg = { ...readSchedulerOptions(), ...opts };

  if (cfg.retryFailedJobs) {
    const { hasDatabase, getDb } = await import("@/lib/db");
    if (hasDatabase()) {
      const db = getDb();
      // Re-queue failed jobs with retryCount < 3
      await db.processingJob.updateMany({
        where: { status: "failed", retryCount: { lt: 3 } },
        data: {
          status: "queued",
          progressPercent: 0,
          startedAt: null,
          completedAt: null,
          retryCount: { increment: 1 },
          errorMessage: null,
        },
      });
    }
  }

  return processUntilEmpty({ maxJobs: cfg.maxJobsPerRun });
}

/**
 * Spec alias for `runOnce` — runs the overnight processing window once.
 * Kept as a separate export so cron entries / npm scripts read naturally.
 */
export async function runOvernightProcessing(
  opts?: Partial<SchedulerOptions>,
) {
  return runOnce(opts);
}

/**
 * Long-running daemon: sleep until the configured start time, run, then
 * sleep 24h again. Use a real cron in production.
 */
export async function runDaemon() {
  const cfg = readSchedulerOptions();
  if (!cfg.overnightEnabled) {
    console.log(
      "[scheduler] overnight disabled. Set OVERNIGHT_PROCESSING_ENABLED=true to enable.",
    );
    return;
  }
  const { h, m } = parseHHMM(cfg.startTime);
  console.log(
    `[scheduler] daemon started — overnight window ${cfg.startTime}, max ${cfg.maxJobsPerRun} jobs/run`,
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wait = msUntil(h, m);
    console.log(
      `[scheduler] sleeping ${(wait / 1000 / 60).toFixed(1)} min until next run…`,
    );
    await new Promise((r) => setTimeout(r, wait));
    try {
      const results = await runOnce();
      console.log(`[scheduler] processed ${results.length} jobs`);
    } catch (err) {
      console.error("[scheduler] run failed", err);
    }
  }
}

if (require.main === module) {
  runDaemon().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
