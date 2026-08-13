import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPodcasts, getSources } from "@/lib/data";
import { formatRelativeDate } from "@/lib/utils";

export const metadata = { title: "Archives" };

export default async function ArchivesPage() {
  const [podcasts, sources] = await Promise.all([getPodcasts(), getSources()]);
  return (
    <div>
      <PageHeader
        title="Archives"
        description="Each archive is a podcast or show. An archive can be fed by one or many sources."
        actions={
          <Link href="/sources#add-source" className="btn-primary">
            Add archive
          </Link>
        }
      />

      {podcasts.length === 0 && (
        <EmptyState
          title="No archives yet"
          description="An archive is a podcast or show. Add a source to create your first one."
          action={
            <Link href="/sources#add-source" className="btn-primary">
              Add source
            </Link>
          }
        />
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {podcasts.map((p) => {
          const podSources = sources.filter((s) => s.podcastId === p.id);
          return (
            <Link
              key={p.id}
              href={`/episodes?archive=${p.id}`}
              className="card card-hover overflow-hidden flex flex-col"
            >
              <div className="aspect-video bg-bg-elevated relative overflow-hidden border-b border-border">
                {p.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverImageUrl}
                    alt={p.name}
                    className="w-full h-full object-cover opacity-90"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-4xl font-semibold">
                    {p.name.charAt(0)}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <h2 className="font-semibold text-text-primary text-lg leading-tight">
                    {p.name}
                  </h2>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-sm text-text-muted line-clamp-2 mb-3">
                  {p.description}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Stat label="Episodes" value={p.episodeCount} />
                  <Stat label="Searchable" value={p.searchableCount} />
                </div>
                <div className="mt-auto flex items-center justify-between text-[0.8125rem] text-text-dim">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={
                        podSources.some((s) => s.syncStatus === "syncing")
                          ? "syncing"
                          : "completed"
                      }
                    />
                    <span>
                      {podSources.length} source
                      {podSources.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span>last synced {formatRelativeDate(p.lastSyncedAt)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-subtle rounded-md border border-border px-3 py-2">
      <div className="text-[0.75rem] text-text-muted">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
