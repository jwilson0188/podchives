"use client";

import { ProcessingQueueTable } from "@/components/processing/ProcessingQueueTable";
import { useQueuePoll } from "@/hooks/useQueuePoll";
import type { ProcessingJobBucket } from "@/lib/data";

export function ProcessingQueueLiveBody({
  initial,
  enabled,
}: {
  initial: ProcessingJobBucket;
  enabled: boolean;
}) {
  const { data, failed: unavailable } = useQueuePoll(initial, enabled);
  if (!data) return <p role="alert" className="card p-4 text-warn">Processing queue is unavailable. Retrying automatically.</p>;

  const { active, queued, failed, completed, totals } = data;

  return (
    <>
      {unavailable && <p role="alert" className="card p-4 mb-4 text-warn">Queue updates are unavailable. Showing the last successful snapshot; job states may have changed. Retrying automatically.</p>}
      <ProcessingQueueTable
        title="Active"
        jobs={active}
        emptyTitle="No jobs running right now."
        defaultOpen
      />
      <ProcessingQueueTable
        title="Failed or stopped"
        jobs={failed}
        emptyTitle="No failed or stopped jobs."
        defaultOpen={false}
        totalCount={totals.failed}
      />
      <ProcessingQueueTable
        title="Queued"
        jobs={queued}
        emptyTitle={
          totals.queued > 50
            ? `Nothing in the first 50 — ${totals.queued.toLocaleString()} total queued.`
            : "Nothing queued."
        }
        defaultOpen={queued.length > 0}
        totalCount={totals.queued}
      />
      <ProcessingQueueTable
        title="Recently finished"
        jobs={completed}
        emptyTitle="No finished jobs yet."
        defaultOpen={false}
      />
    </>
  );
}
