"use client";

import { ProcessingQueueTable } from "@/components/processing/ProcessingQueueTable";
import { useLivePoll } from "@/hooks/useLivePoll";
import type { ProcessingJobBucket } from "@/lib/data";

export function ProcessingQueueLiveBody({
  initial,
  enabled,
}: {
  initial: ProcessingJobBucket;
  enabled: boolean;
}) {
  const { data } = useLivePoll(
    "/api/processing-queue/live",
    initial,
    4_000,
    enabled,
  );

  const { active, queued, failed, completed, totals } = data;

  return (
    <>
      <ProcessingQueueTable
        title="Active"
        jobs={active}
        emptyTitle="No jobs running right now."
        defaultOpen
      />
      <ProcessingQueueTable
        title="Failed"
        jobs={failed}
        emptyTitle="No failed jobs. All clear."
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
        title="Recently completed"
        jobs={completed}
        emptyTitle="No completed jobs yet."
        defaultOpen={false}
      />
    </>
  );
}
