import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UsageCreditsCard } from "@/components/usage/UsageCreditsCard";
import { AutoSyncButton } from "@/components/dashboard/AutoSyncButton";
import {
  getActiveProcessingJobs,
  getAutoSyncSummary,
  getDashboardStats,
  getRecentEpisodes,
  getRecentSearches,
  getUsageStats,
} from "@/lib/data";
import { formatDate, formatDuration, formatRelativeDate } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

// Always render fresh — DB-backed numbers must reflect the current queue.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const [stats, recentEpisodes, activeJobs, recentSearches, autoSync, usage] =
    await Promise.all([
      getDashboardStats(),
      getRecentEpisodes(5),
      getActiveProcessingJobs(),
      getRecentSearches(4),
      getAutoSyncSummary(),
      getUsageStats(),
    ]);

  return (
    <div>
      <PageHeader
        eyebrow="podchives // overview"
        title="Dashboard"
        description="Your archive at a glance — search, ingestion, transcription, indexing."
        actions={
          <AutoSyncButton total={autoSync.total} enabled={autoSync.enabled} />
        }
      />

      <section className="card p-5 lg:p-7 mb-8 terminal-grid">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
              Search the archive
            </div>
            <div className="text-text-muted text-sm mt-0.5">
              Every transcript. Every moment. Cite back to the source.
            </div>
          </div>
          <Link href="/advanced-search" className="btn-ghost text-xs">
            Advanced →
          </Link>
        </div>
        <GlobalSearchBar size="lg" autoFocus />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-8">
        <StatCard
          label="Archives"
          value={stats.totalArchives}
          hint="connected shows"
        />
        <StatCard
          label="Episodes"
          value={stats.totalEpisodes}
          hint="total ingested"
        />
        <StatCard
          label="Searchable"
          value={stats.searchableEpisodes}
          hint="indexed & ready"
          accent="success"
        />
        <StatCard
          label="Active jobs"
          value={stats.activeJobs}
          hint="processing now"
          accent="cyan"
        />
        <StatCard
          label="Failed"
          value={stats.failedJobs}
          hint="needs attention"
          accent={stats.failedJobs > 0 ? "danger" : "default"}
        />
      </section>

      <section className="grid lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold tracking-tight">Active processing</h2>
            <Link
              href="/processing-queue"
              className="text-xs text-accent hover:text-accent-hover"
            >
              Open queue →
            </Link>
          </div>
          {activeJobs.length === 0 ? (
            <div className="text-sm text-text-muted py-6 text-center">
              No active jobs. Worker is idle.
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((j) => (
                <div
                  key={j.id}
                  className="bg-bg-subtle rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {j.episodeTitle}
                      </div>
                      <div className="text-[11px] text-text-muted font-mono mt-0.5">
                        {j.podcastName} · {j.jobType.replace(/_/g, " ")}
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  <ProgressBar
                    value={j.progressPercent}
                    status={
                      j.status === "failed"
                        ? "failed"
                        : j.status === "completed"
                          ? "completed"
                          : "active"
                    }
                  />
                  <div className="mt-1.5 text-[11px] text-text-muted font-mono tabular-nums">
                    {j.progressPercent}%
                    {j.workerId && <> · {j.workerId}</>}
                    {j.errorMessage && (
                      <span className="text-danger ml-2">
                        — {j.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <UsageCreditsCard initial={usage} />
      </section>

      <section className="grid lg:grid-cols-2 gap-4 lg:gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold tracking-tight">Recent episodes</h2>
            <Link
              href="/episodes"
              className="text-xs text-accent hover:text-accent-hover"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentEpisodes.length === 0 && (
              <div className="text-sm text-text-muted py-6 text-center">
                No episodes yet. Add a YouTube source to start ingesting.
              </div>
            )}
            {recentEpisodes.map((ep) => (
              <Link
                key={ep.id}
                href={`/episodes/${ep.id}`}
                className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md hover:bg-bg-elevated transition-colors"
              >
                <div className="w-12 h-9 rounded bg-bg-elevated overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ep.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {ep.episodeTitle}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {formatDate(ep.publishDate)} ·{" "}
                    {formatDuration(ep.durationSeconds)}
                  </div>
                </div>
                <StatusBadge status={ep.processingStatus} />
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold tracking-tight">Recent searches</h2>
            <Link
              href="/search"
              className="text-xs text-accent hover:text-accent-hover"
            >
              New search →
            </Link>
          </div>
          <div className="space-y-1">
            {recentSearches.length === 0 ? (
              <div className="text-sm text-text-muted py-6 text-center">
                No searches yet. Try one from the bar above.
              </div>
            ) : (
              recentSearches.map((q) => (
                <Link
                  key={q.id}
                  href={`/search?q=${encodeURIComponent(q.queryText)}`}
                  className="flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-bg-elevated transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate text-text-primary group-hover:text-accent">
                      "{q.queryText}"
                    </div>
                    <div className="text-[11px] text-text-muted font-mono mt-0.5">
                      {q.filtersUsed} · {formatRelativeDate(q.createdAt)}
                    </div>
                  </div>
                  <span className="pill bg-bg-elevated text-text-muted border border-border tabular-nums">
                    {q.resultCount} hits
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
