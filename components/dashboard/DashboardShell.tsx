"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { UsageCreditsCard } from "@/components/usage/UsageCreditsCard";
import { AutoSyncButton } from "@/components/dashboard/AutoSyncButton";
import { BrandHero } from "@/components/dashboard/BrandHero";
import { DashboardLiveProvider } from "@/components/dashboard/DashboardLiveProvider";
import { LivePipelineStrip } from "@/components/dashboard/LivePipelineStrip";
import { LiveProcessingPanel } from "@/components/dashboard/LiveProcessingPanel";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SourceHealthPanel } from "@/components/dashboard/SourceHealthPanel";
import { ArchiveTiles } from "@/components/dashboard/ArchiveTiles";
import { ClipOfTheWeek } from "@/components/dashboard/ClipOfTheWeek";
import { EpisodeGridCard } from "@/components/dashboard/EpisodeGridCard";
import {
  dashboardHasArchiveData,
  mergeDashboardWithStash,
  stashDashboard,
  type DashboardPayload,
} from "@/lib/dashboardCache";
import { formatRelativeDate } from "@/lib/utils";

export function DashboardShell({
  server,
  isDemo,
}: {
  server: DashboardPayload;
  isDemo: boolean;
}) {
  const [clientRefresh, setClientRefresh] = useState<DashboardPayload | null>(
    null,
  );

  const base = clientRefresh ?? server;
  const data = useMemo(() => mergeDashboardWithStash(base), [base]);

  useEffect(() => {
    if (dashboardHasArchiveData(base.cockpit)) {
      stashDashboard(base);
    }
  }, [base]);

  // SSR occasionally returns empty under pool pressure — one client fetch recovers.
  useEffect(() => {
    if (isDemo || dashboardHasArchiveData(server.cockpit)) return;

    let cancelled = false;
    fetch("/api/dashboard/cockpit", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.cockpit) return;
        if (!dashboardHasArchiveData(json.cockpit)) return;
        const payload: DashboardPayload = {
          cockpit: json.cockpit,
          featuredClip: json.featuredClip ?? null,
          recentEpisodes: json.recentEpisodes ?? [],
          recentSearches: json.recentSearches ?? [],
          autoSync: json.autoSync ?? { total: 0, enabled: 0 },
          usage: json.usage,
          liveSnapshot: json.liveSnapshot,
        };
        setClientRefresh(payload);
        stashDashboard(payload);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [server.cockpit, isDemo]);

  return (
    <DashboardLiveProvider initial={data.liveSnapshot} enabled={!isDemo}>
      <div>
        <BrandHero
          cockpit={data.cockpit}
          actions={
            <AutoSyncButton
              total={data.autoSync.total}
              enabled={data.autoSync.enabled}
            />
          }
        />

        <ArchiveTiles archives={data.cockpit.archives} />

        {data.featuredClip && <ClipOfTheWeek clip={data.featuredClip} />}

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

        <LivePipelineStrip />

        <section className="grid lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
          <div className="lg:col-span-2">
            <LiveProcessingPanel />
          </div>

          <UsageCreditsCard initial={data.usage} />
        </section>

        <section className="grid lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
          <SourceHealthPanel sources={data.cockpit.sources} />

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
              {data.recentSearches.length === 0 ? (
                <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg">
                  Search your archive above — every query is saved here for quick
                  re-runs.
                </div>
              ) : (
                data.recentSearches.map((q) => (
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
          {data.recentEpisodes.length === 0 ? (
            <div className="text-sm text-text-muted py-8 text-center border border-dashed border-border rounded-lg">
              No episodes yet.{" "}
              <Link href="/sources#add-source" className="text-accent hover:underline">
                Connect a YouTube source
              </Link>{" "}
              to start building your searchable archive.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.recentEpisodes.map((ep) => (
                <EpisodeGridCard key={ep.id} episode={ep} />
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLiveProvider>
  );
}
