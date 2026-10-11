"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourcesList } from "@/components/sources/SourcesList";
import { DownloadManagerTable } from "./DownloadManagerTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeDate } from "@/lib/utils";
import type { DownloadManagerSnapshot } from "@/lib/data";
import { useDownloadPoll } from "@/hooks/useDownloadPoll";

export function DownloadManagerLiveBody({ initial }: { initial: DownloadManagerSnapshot }) {
  const { data, failed } = useDownloadPoll(initial);
  if (!data) return <div><PageHeader title="Download Manager" description="Sources and episode processing" /><p role="alert" className="card p-4 text-warn">Download Manager is unavailable. Retrying automatically.</p></div>;
  const { downloads, episodes, sources } = data;
  const lastSync = sources
    .map((s) => s.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <div>
      <PageHeader
        title="Download Manager"
        description="Mission control for ingestion. Sources, syncs, downloads, transcripts, embeddings, indexing — end to end."
        actions={<Link href="/sources" className="btn-secondary text-sm">Manage sources</Link>}
      />

      {failed && <p role="alert" className="card p-4 mb-4 text-warn">Download updates are unavailable. Showing the last successful snapshot; states may have changed. Retrying automatically.</p>}
      {data.demo && <p className="text-sm text-text-muted mb-4">Demo preview — these records are sample data.</p>}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold tracking-tight">Connected sources</h2>
          <span className="text-[0.8125rem] text-text-muted font-mono">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          <SourcesList
            initial={sources}
            showStopSync
            emptyDescription="Add a YouTube source on the Sources page to start ingesting."
          />
        </div>
      </section>

      <section className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SyncStat
          label="Episodes in download list"
          value={episodes.length}
          status="completed"
        />
        <SyncStat
          label="Pending downloads shown"
          value={
            downloads.filter(
              (d) => d.status !== "completed" && d.status !== "failed",
            ).length
          }
          status="running"
        />
        <SyncStat
          label="Failed or stopped shown"
          value={downloads.filter((d) => d.status === "failed").length}
          status={
            downloads.some((d) => d.status === "failed")
              ? "failed"
              : "completed"
          }
        />
        <SyncStat
          label="Last sync"
          value={lastSync ? formatRelativeDate(lastSync) : "—"}
          status={lastSync ? "completed" : "queued"}
        />
      </section>

      <p className="text-sm text-text-muted mb-3">Showing the latest {downloads.length} download records (up to 200). Caption-only episodes may not appear here.</p>
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h2 className="font-semibold tracking-tight">Episode pipeline</h2>
          <span className="text-[0.8125rem] text-text-muted font-mono break-words">
            ingest → download → transcribe → embed → index → searchable
          </span>
        </div>
        {downloads.length === 0 ? (
          <EmptyState
            title="No downloads yet"
            description="Audio download attempts appear here. Caption-only episodes may have no download record."
          />
        ) : (
          <DownloadManagerTable downloads={downloads} episodes={episodes} />
        )}
      </section>
    </div>
  );
}

function SyncStat({
  label,
  value,
  status,
}: {
  label: string;
  value: string | number;
  status: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[0.75rem] text-text-muted font-medium">
          {label}
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
