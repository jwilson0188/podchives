import { ProcessingJobRow } from "./ProcessingJobRow";
import type { DemoProcessingJob } from "@/lib/demoData";
import { EmptyState } from "@/components/ui/EmptyState";

export function ProcessingQueueTable({
  title,
  jobs,
  emptyTitle,
}: {
  title: string;
  jobs: DemoProcessingJob[];
  emptyTitle: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold tracking-tight">
          {title}
          <span className="ml-2 text-text-muted text-sm font-normal tabular-nums">
            {jobs.length}
          </span>
        </h2>
      </div>
      {jobs.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {jobs.map((j) => (
            <ProcessingJobRow key={j.id} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}
