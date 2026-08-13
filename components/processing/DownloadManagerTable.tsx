import { ErrorMessage } from "@/components/ui/ErrorMessage";
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
    <>
      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {downloads.map((d) => {
          const ep = epById.get(d.episodeId);
          return (
            <article key={d.id} className="card p-4 min-w-0 overflow-hidden">
              <div className="min-w-0">
                <div className="font-medium text-sm break-words [overflow-wrap:anywhere]">
                  {d.episodeTitle}
                </div>
                <div className="text-[0.8125rem] text-text-muted font-mono mt-1 break-words">
                  {d.podcastName}
                  {d.completedAt && (
                    <> · finished {formatRelativeDate(d.completedAt)}</>
                  )}
                  {!d.completedAt && d.startedAt && (
                    <> · started {formatRelativeDate(d.startedAt)}</>
                  )}
                </div>
              </div>

              {d.errorMessage && (
                <ErrorMessage className="mt-3">{d.errorMessage}</ErrorMessage>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 text-[0.8125rem]">
                <Meta label="Type" value={d.downloadType} />
                <Meta
                  label="Searchable"
                  value={ep?.isSearchable ? "ready" : "pending"}
                />
                {ep && (
                  <>
                    <Meta label="Transcript" value={ep.transcriptStatus} />
                    <Meta label="Embed" value={ep.embeddingStatus} />
                  </>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <StatusBadge status={d.status} />
                  <span className="text-[0.8125rem] text-text-muted font-mono tabular-nums">
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
                />
              </div>

              <div className="mt-3 flex gap-2">
                {d.status === "failed" ? (
                  <button className="btn-danger text-xs flex-1">Retry</button>
                ) : d.status === "completed" ? null : (
                  <button className="btn-ghost text-xs flex-1">Cancel</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[0.75rem] text-text-muted bg-bg-subtle">
                <th className="text-left font-medium px-4 py-3 min-w-[220px]">
                  Episode
                </th>
                <th className="text-left font-medium px-3 py-3">Type</th>
                <th className="text-left font-medium px-3 py-3 min-w-[160px]">
                  Download
                </th>
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
                  <tr key={d.id} className="table-row align-top">
                    <td className="px-4 py-3 min-w-0 max-w-xs lg:max-w-md">
                      <div className="font-medium break-words [overflow-wrap:anywhere]">
                        {d.episodeTitle}
                      </div>
                      <div className="text-[0.8125rem] text-text-muted font-mono mt-0.5">
                        {d.podcastName}
                        {d.completedAt && (
                          <> · finished {formatRelativeDate(d.completedAt)}</>
                        )}
                        {!d.completedAt && d.startedAt && (
                          <> · started {formatRelativeDate(d.startedAt)}</>
                        )}
                      </div>
                      {d.errorMessage && (
                        <ErrorMessage compact className="mt-2">
                          {d.errorMessage}
                        </ErrorMessage>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="pill bg-bg-elevated text-text-muted border border-border">
                        {d.downloadType}
                      </span>
                    </td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        <span className="text-[0.8125rem] text-text-muted font-mono tabular-nums">
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
                    <td className="px-3 py-3 whitespace-nowrap">
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
                        <span className="text-[0.8125rem] text-text-muted">—</span>
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
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle px-2.5 py-2 min-w-0">
      <div className="text-[0.75rem] text-text-muted">
        {label}
      </div>
      <div className="text-xs font-mono mt-0.5 truncate">{value}</div>
    </div>
  );
}
