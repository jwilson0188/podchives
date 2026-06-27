import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourcesList } from "@/components/sources/SourcesList";
import { DownloadManagerTable } from "@/components/processing/DownloadManagerTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { getDownloads, getEpisodes, getSourcesWithRetry } from "@/lib/data";
import { formatRelativeDate } from "@/lib/utils";

export const metadata = { title: "Download Manager" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DownloadManagerPage() {
  const [downloads, episodes, sources] = await Promise.all([
    getDownloads(),
    getEpisodes({ limit: 500 }),
    getSourcesWithRetry(),
  ]);
  const lastSync = sources
    .map((s) => s.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <div>
      <PageHeader
        eyebrow="ops // mission control"
        title="Download Manager"
        description="Mission control for ingestion. Sources, syncs, downloads, transcripts, embeddings, indexing — end to end."
        actions={
          <button className="btn-secondary text-sm">Sync all sources</button>
        }
      />

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold tracking-tight">Connected sources</h2>
          <span className="text-[11px] text-text-muted font-mono">
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
          label="Episodes ingested"
          value={episodes.length}
          status="completed"
        />
        <SyncStat
          label="Pending downloads"
          value={
            downloads.filter(
              (d) => d.status !== "completed" && d.status !== "failed",
            ).length
          }
          status="running"
        />
        <SyncStat
          label="Failed downloads"
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

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold tracking-tight">Episode pipeline</h2>
          <span className="text-[11px] text-text-muted font-mono">
            ingest → download → transcribe → embed → index → searchable
          </span>
        </div>
        {downloads.length === 0 ? (
          <EmptyState
            title="No downloads yet"
            description="When the worker pulls episodes for the first time, you'll see live download status here."
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
        <div className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
          {label}
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
