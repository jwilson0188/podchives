import { PageHeader } from "@/components/ui/PageHeader";
import { ProcessingQueueTable } from "@/components/processing/ProcessingQueueTable";
import { WorkerControls } from "@/components/processing/WorkerControls";
import { IS_DEMO_MODE } from "@/lib/constants";
import { getProcessingJobs } from "@/lib/data";
import { hasDatabase } from "@/lib/db";
import { getWorkerStatus } from "@/lib/workerControl";

export const metadata = { title: "Processing Queue" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProcessingQueuePage() {
  const [{ active, queued, failed, completed, totals }, workerStatus] =
    await Promise.all([
    getProcessingJobs(),
    IS_DEMO_MODE || !hasDatabase()
      ? Promise.resolve({
          enabled: true,
          queuedCount: 0,
          activeCount: 0,
          lastRunAt: null,
          demo: true,
        })
      : getWorkerStatus(),
  ]);

  const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 1);
  const workerLabel =
    (process.env.PROCESSING_MODE ?? "local") === "render-worker"
      ? "podchives-worker"
      : "worker-local";

  return (
    <div>
      <PageHeader
        eyebrow="ops // queue"
        title="Processing Queue"
        description="Live worker state — what's running, what's waiting, what failed, and what just shipped."
        actions={<WorkerControls initialStatus={workerStatus} />}
      />

      <section className="grid lg:grid-cols-3 gap-3 mb-8">
        <WorkerCard
          title="Worker"
          value={workerLabel}
          status={workerStatus.enabled ? "online" : "paused"}
          hint={`${workerStatus.enabled ? "processing" : "paused"} · concurrency ${concurrency}`}
        />
        <WorkerCard
          title="Queue depth"
          value={`${totals.queued.toLocaleString()} queued · ${totals.active.toLocaleString()} active`}
          status={totals.queued > 0 || totals.active > 0 ? "scheduled" : "ok"}
          hint={
            totals.failed > 0
              ? `${totals.failed.toLocaleString()} failed total · showing latest 25 below`
              : workerStatus.lastRunAt
                ? `last run ${new Date(workerStatus.lastRunAt).toLocaleString()}`
                : "no runs recorded yet"
          }
        />
        <WorkerCard
          title="Overnight processing"
          value="02:00 → 06:00"
          status={
            (process.env.OVERNIGHT_PROCESSING_ENABLED ?? "false") === "true"
              ? "scheduled"
              : "off"
          }
          hint="max 3 jobs/run · retries: on"
        />
      </section>

      <ProcessingQueueTable
        title="Active"
        jobs={active}
        emptyTitle="No jobs running right now."
      />
      <ProcessingQueueTable
        title="Failed"
        jobs={failed}
        emptyTitle="No failed jobs. All clear."
      />
      <ProcessingQueueTable
        title="Queued"
        jobs={queued}
        emptyTitle={
          totals.queued > 50
            ? `Nothing in the first 50 — ${totals.queued.toLocaleString()} total queued.`
            : "Nothing queued."
        }
      />
      <ProcessingQueueTable
        title="Recently completed"
        jobs={completed}
        emptyTitle="No completed jobs yet."
      />
    </div>
  );
}

function WorkerCard({
  title,
  value,
  status,
  hint,
}: {
  title: string;
  value: string;
  status: string;
  hint?: string;
}) {
  const statusTone: Record<string, string> = {
    online: "bg-success-muted text-success",
    paused: "bg-bg-elevated text-text-muted border border-border",
    scheduled: "bg-cyan-muted text-cyan",
    off: "bg-bg-elevated text-text-muted border border-border",
    ok: "bg-success-muted text-success",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
          {title}
        </div>
        <span className={"pill " + (statusTone[status] ?? statusTone.off)}>
          {status === "online" && (
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          )}
          {status}
        </span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-text-muted mt-1">{hint}</div>}
    </div>
  );
}
