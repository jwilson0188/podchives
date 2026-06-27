import type {
  CockpitSummary,
  DashboardLiveSnapshot,
  EpisodeView,
  FeaturedClip,
  SearchHistoryView,
  UsageStats,
} from "@/lib/data";
import { readSessionJson, writeSessionJson } from "@/lib/sessionStore";

export type DashboardPayload = {
  cockpit: CockpitSummary;
  featuredClip: FeaturedClip | null;
  recentEpisodes: EpisodeView[];
  recentSearches: SearchHistoryView[];
  autoSync: { total: number; enabled: number };
  usage: UsageStats;
  liveSnapshot: DashboardLiveSnapshot;
};

export function dashboardHasArchiveData(cockpit: CockpitSummary): boolean {
  return (
    cockpit.sources.length > 0 ||
    cockpit.stats.totalEpisodes > 0 ||
    cockpit.archives.length > 0
  );
}

export function liveSnapshotLooksEmpty(s: DashboardLiveSnapshot): boolean {
  return (
    s.stats.totalEpisodes === 0 &&
    s.transcriptMoments === 0 &&
    s.activeJobs.length === 0
  );
}

let stash: DashboardPayload | null = null;

const SESSION_KEY = "dashboard:payload";

function readSessionStash(): DashboardPayload | null {
  return readSessionJson<DashboardPayload>(SESSION_KEY);
}

export function stashDashboard(payload: DashboardPayload): void {
  if (dashboardHasArchiveData(payload.cockpit)) {
    stash = payload;
    writeSessionJson(SESSION_KEY, payload);
  }
}

export function getStashedDashboard(): DashboardPayload | null {
  return stash ?? readSessionStash();
}

/**
 * Prefer server data when healthy; fall back to last good in-memory stash when
 * a navigation re-fetch returns empty (transient DB / pool errors).
 */
export function cockpitSourcesMissing(cockpit: CockpitSummary): boolean {
  return cockpit.stats.totalEpisodes > 0 && cockpit.sources.length === 0;
}

export function mergeDashboardWithStash(
  server: DashboardPayload,
): DashboardPayload {
  const stashRef = stash ?? readSessionStash();

  if (dashboardHasArchiveData(server.cockpit)) {
    if (
      stashRef &&
      cockpitSourcesMissing(server.cockpit) &&
      stashRef.cockpit.sources.length > 0
    ) {
      return {
        ...server,
        cockpit: {
          ...server.cockpit,
          sources: stashRef.cockpit.sources,
          archives:
            server.cockpit.archives.length > 0
              ? server.cockpit.archives
              : stashRef.cockpit.archives,
        },
        autoSync:
          server.autoSync.total > 0 ? server.autoSync : stashRef.autoSync,
      };
    }
    return server;
  }

  if (!stash || !dashboardHasArchiveData(stash.cockpit)) {
    const session = readSessionStash();
    if (session && dashboardHasArchiveData(session.cockpit)) {
      stash = session;
    }
  }

  if (!stash || !dashboardHasArchiveData(stash.cockpit)) {
    return server;
  }

  return {
    cockpit: stash.cockpit,
    featuredClip: server.featuredClip ?? stash.featuredClip,
    recentEpisodes:
      server.recentEpisodes.length > 0
        ? server.recentEpisodes
        : stash.recentEpisodes,
    recentSearches:
      server.recentSearches.length > 0
        ? server.recentSearches
        : stash.recentSearches,
    autoSync:
      server.autoSync.total > 0 ? server.autoSync : stash.autoSync,
    usage: server.usage.transcriptionMinutes > 0 ? server.usage : stash.usage,
    liveSnapshot: liveSnapshotLooksEmpty(server.liveSnapshot)
      ? stash.liveSnapshot
      : server.liveSnapshot,
  };
}
