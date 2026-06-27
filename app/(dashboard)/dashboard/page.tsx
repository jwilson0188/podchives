import Link from "next/link";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { UsageCreditsCard } from "@/components/usage/UsageCreditsCard";
import { AutoSyncButton } from "@/components/dashboard/AutoSyncButton";
import { BrandHero } from "@/components/dashboard/BrandHero";
import { PipelineStrip } from "@/components/dashboard/PipelineStrip";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SourceHealthPanel } from "@/components/dashboard/SourceHealthPanel";
import { ArchiveTiles } from "@/components/dashboard/ArchiveTiles";
import { ClipOfTheWeek } from "@/components/dashboard/ClipOfTheWeek";
import { EpisodeGridCard } from "@/components/dashboard/EpisodeGridCard";
import {
  getActiveProcessingJobs,
  getAutoSyncSummary,
  getCockpitSummary,
  getDataMode,
  getFeaturedClip,
  getRecentEpisodes,
  getRecentSearches,
  getUsageStats,
} from "@/lib/data";
import { formatDate, formatRelativeDate } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const [
    cockpit,
    featuredClip,
    recentEpisodes,
    activeJobs,
    recentSearches,
    autoSync,
    usage,
  ] = await Promise.all([
    getCockpitSummary(),
    getFeaturedClip(),
    getRecentEpisodes(6),
    getActiveProcessingJobs(),
    getRecentSearches(5),
    getAutoSyncSummary(),
    getUsageStats(),
  ]);

  const isDemo = getDataMode() === "demo";

  return (
    <div>
      {isDemo ? null : <AutoRefresh intervalMs={15_000} />}

      <BrandHero
        cockpit={cockpit}
        actions={
          <AutoSyncButton total={autoSync.total} enabled={autoSync.enabled} />
        }
      />

      <ArchiveTiles archives={cockpit.archives} />

      {featuredClip && <ClipOfTheWeek clip={featuredClip} />}

      {/* Primary creator action — search is the product */}
      <section className="card p-5 lg:p-6 mb-6 terminal-grid">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">
              Search your archive
            </div>
            <div className="text-text-muted text-sm mt-0.5">
              Every quote, topic, and moment — cite back to the exact timestamp.
            </div>
          </div>
        </div>
        <GlobalSearchBar size="lg" autoFocus={false} />
      </section>

      <QuickActions />

      <PipelineStrip cockpit={cockpit} />

      {/* Live ops: what's running right now + spend */}
      <section className="grid lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold tracking-tight">Live processing</h2>
              <p className="text-xs text-text-muted mt-0.5">
                What the worker is doing right now
              </p>
            </div>
            <Link
              href="/processing-queue"
              className="text-xs text-accent hover:text-accent-hover"
            >
              Open queue →
            </Link>
          </div>
          {activeJobs.length === 0 ? (
            <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg">
              {cockpit.stats.queuedJobs > 0 ? (
                <>
                  Worker idle —{" "}
                  <span className="text-warn font-medium">
                    {cockpit.stats.queuedJobs} jobs
                  </span>{" "}
                  waiting in queue.
                </>
              ) : cockpit.backlogEpisodes > 0 ? (
                <>
                  Nothing running.{" "}
                  <span className="text-warn font-medium">
                    {cockpit.backlogEpisodes} episodes
                  </span>{" "}
                  still need processing — turn on auto-sync to drain the backlog.
                </>
              ) : (
                "All caught up. Your archive is fully indexed."
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.slice(0, 5).map((j) => (
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
                    {j.errorMessage && (
                      <span className="text-danger ml-2">
                        — {j.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {activeJobs.length > 5 && (
                <Link
                  href="/processing-queue"
                  className="block text-center text-xs text-text-muted hover:text-accent"
                >
                  +{activeJobs.length - 5} more active jobs
                </Link>
              )}
            </div>
          )}
        </div>

        <UsageCreditsCard initial={usage} />
      </section>

      {/* Sources + research patterns */}
      <section className="grid lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
        <SourceHealthPanel sources={cockpit.sources} />

        <div className="card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold tracking-tight">Recent searches</h2>
              <p className="text-xs text-text-muted mt-0.5">
                What you&apos;ve been looking for
              </p>
            </div>
            <Link
              href="/search"
              className="text-xs text-accent hover:text-accent-hover"
            >
              New search →
            </Link>
          </div>
          <div className="space-y-1 flex-1">
            {recentSearches.length === 0 ? (
              <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg">
                Search your archive above — every query is saved here for quick
                re-runs.
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
                      &ldquo;{q.queryText}&rdquo;
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

      {/* Latest content */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold tracking-tight">Latest episodes</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Most recently ingested into your archive
            </p>
          </div>
          <Link
            href="/episodes"
            className="text-xs text-accent hover:text-accent-hover"
          >
            View catalog →
          </Link>
        </div>
        {recentEpisodes.length === 0 ? (
          <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg">
            No episodes yet.{" "}
            <Link href="/sources" className="text-accent hover:underline">
              Connect a YouTube source
            </Link>{" "}
            to start building your searchable archive.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentEpisodes.map((ep) => (
              <EpisodeGridCard key={ep.id} episode={ep} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
