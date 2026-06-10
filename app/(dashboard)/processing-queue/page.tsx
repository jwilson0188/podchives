import { PageHeader } from "@/components/ui/PageHeader";
import { ProcessingQueueTable } from "@/components/processing/ProcessingQueueTable";
import { getProcessingJobs } from "@/lib/data";

export const metadata = { title: "Processing Queue" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProcessingQueuePage() {
  const { active, queued, failed, completed } = await getProcessingJobs();

  return (
    <div>
      <PageHeader
        eyebrow="ops // queue"
        title="Processing Queue"
        description="Live worker state — what's running, what's waiting, what failed, and what just shipped."
        actions={
          <>
            <button className="btn-secondary text-sm">Pause worker</button>
            <button className="btn-primary text-sm">Run next job</button>
          </>
        }
      />

      <section className="grid lg:grid-cols-3 gap-3 mb-8">
        <WorkerCard
          title="Worker"
          value="worker-local-01"
          status="online"
          hint="local · concurrency 1"
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
        <WorkerCard
          title="Compute budget"
          value="56 / 200 min"
          status="ok"
          hint="resets monthly"
        />
      </section>

      <ProcessingQueueTable
        title="Active"
        jobs={active}
        emptyTitle="Worker is idle. No active jobs."
      />
      <ProcessingQueueTable
        title="Failed"
        jobs={failed}
        emptyTitle="No failed jobs. All clear."
      />
      <ProcessingQueueTable
        title="Queued"
        jobs={queued}
        emptyTitle="Nothing queued."
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
