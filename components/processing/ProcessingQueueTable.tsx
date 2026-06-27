"use client";

import { Collapsible } from "@/components/ui/Collapsible";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProcessingJobRow } from "./ProcessingJobRow";
import type { DemoProcessingJob } from "@/lib/demoData";

export function ProcessingQueueTable({
  title,
  jobs,
  emptyTitle,
  defaultOpen = true,
  totalCount,
}: {
  title: string;
  jobs: DemoProcessingJob[];
  emptyTitle: string;
  defaultOpen?: boolean;
  /** Optional DB total when the list is truncated. */
  totalCount?: number;
}) {
  const countLabel =
    totalCount != null && totalCount > jobs.length
      ? `${jobs.length} shown · ${totalCount.toLocaleString()} total`
      : String(jobs.length);

  return (
    <Collapsible
      variant="card"
      defaultOpen={defaultOpen}
      className="mb-6 p-0 overflow-hidden"
      headerClassName="px-4 py-3"
      contentClassName="px-4 pb-4 pt-0 border-t-0"
      title={
        <h2 className="font-semibold tracking-tight text-base">
          {title}
          <span className="ml-2 text-text-muted text-sm font-normal tabular-nums">
            {countLabel}
          </span>
        </h2>
      }
    >
      {jobs.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {jobs.map((j) => (
            <ProcessingJobRow key={j.id} job={j} />
          ))}
        </div>
      )}
    </Collapsible>
  );
}
