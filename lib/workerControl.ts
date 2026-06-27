/**
 * Global worker on/off switch — stored in scheduler_settings.
 *
 * The worker process stays alive (local or Render) but skips job claims and
 * auto-sync while paused. Defaults to enabled when no row exists.
 */
import { hasDatabase, getDb } from "./db";

export type WorkerStatus = {
  enabled: boolean;
  queuedCount: number;
  activeCount: number;
  lastRunAt: string | null;
  demo: boolean;
};

export async function isWorkerEnabled(): Promise<boolean> {
  if (!hasDatabase()) return true;
  try {
    const row = await getDb().schedulerSettings.findFirst({
      select: { workerEnabled: true },
    });
    return row?.workerEnabled ?? true;
  } catch {
    return true;
  }
}

export async function setWorkerEnabled(enabled: boolean) {
  const db = getDb();
  const existing = await db.schedulerSettings.findFirst();
  if (existing) {
    return db.schedulerSettings.update({
      where: { id: existing.id },
      data: { workerEnabled: enabled },
    });
  }
  return db.schedulerSettings.create({ data: { workerEnabled: enabled } });
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
  const db = getDb();
  const [settings, queuedCount, activeCount, lastRun] = await Promise.all([
    db.schedulerSettings.findFirst({ select: { workerEnabled: true } }),
    db.processingJob.count({ where: { status: "queued" } }),
    db.processingJob.count({
      where: {
        status: {
          notIn: ["queued", "completed", "failed"],
        },
      },
    }),
    db.workerRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);

  return {
    enabled: settings?.workerEnabled ?? true,
    queuedCount,
    activeCount,
    lastRunAt: lastRun?.startedAt.toISOString() ?? null,
    demo: false,
  };
}
