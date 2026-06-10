import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { DemoDownload, DemoEpisode } from "@/lib/demoData";
import { formatRelativeDate } from "@/lib/utils";

export function DownloadManagerTable({
  downloads,
  episodes,
}: {
  downloads: DemoDownload[];
  episodes: DemoEpisode[];
}) {
  const epById = new Map(episodes.map((e) => [e.id, e]));

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-text-muted bg-bg-subtle">
              <th className="text-left font-medium px-4 py-3">Episode</th>
              <th className="text-left font-medium px-3 py-3 hidden md:table-cell">
                Type
              </th>
              <th className="text-left font-medium px-3 py-3">Download</th>
              <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">
                Transcript
              </th>
              <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">
                Embed
              </th>
              <th className="text-left font-medium px-3 py-3">Searchable</th>
              <th className="text-right font-medium px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {downloads.map((d) => {
              const ep = epById.get(d.episodeId);
              return (
                <tr key={d.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="font-medium truncate max-w-md">
                      {d.episodeTitle}
                    </div>
                    <div className="text-[11px] text-text-muted font-mono mt-0.5">
                      {d.podcastName}
                      {d.completedAt && (
                        <> · finished {formatRelativeDate(d.completedAt)}</>
                      )}
                      {!d.completedAt && d.startedAt && (
                        <> · started {formatRelativeDate(d.startedAt)}</>
                      )}
                    </div>
                    {d.errorMessage && (
                      <div className="text-[11px] text-danger font-mono mt-0.5">
                        {d.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="pill bg-bg-elevated text-text-muted border border-border">
                      {d.downloadType}
                    </span>
                  </td>
                  <td className="px-3 py-3 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.status} />
                      <span className="text-[11px] text-text-muted font-mono tabular-nums">
                        {d.progressPercent}%
                      </span>
                    </div>
                    <ProgressBar
                      value={d.progressPercent}
                      status={
                        d.status === "failed"
                          ? "failed"
                          : d.status === "completed"
                            ? "completed"
                            : d.status === "queued"
                              ? "queued"
                              : "active"
                      }
                      className="mt-1.5"
                    />
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell">
                    {ep && <StatusBadge status={ep.transcriptStatus} />}
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell">
                    {ep && <StatusBadge status={ep.embeddingStatus} />}
                  </td>
                  <td className="px-3 py-3">
                    {ep?.isSearchable ? (
                      <span className="pill bg-success-muted text-success">
                        ready
                      </span>
                    ) : (
                      <span className="pill bg-bg-elevated text-text-muted border border-border">
                        pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {d.status === "failed" ? (
                      <button className="btn-danger text-xs">Retry</button>
                    ) : d.status === "completed" ? (
                      <span className="text-[11px] text-text-muted">—</span>
                    ) : (
                      <button className="btn-ghost text-xs">Cancel</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
