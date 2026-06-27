import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  getAutoSyncSummary,
  getCockpitSummaryWithRetry,
  getDashboardLiveSnapshot,
  getDataMode,
  getFeaturedClip,
  getRecentEpisodes,
  getRecentSearches,
  getUsageStats,
} from "@/lib/data";

export const metadata = { title: "Dashboard" };

/** Cache shell for 5 min — live widgets poll APIs separately. */
export const revalidate = 300;

export default async function DashboardPage() {
  const [
    cockpit,
    featuredClip,
    recentEpisodes,
    recentSearches,
    autoSync,
    usage,
    liveSnapshot,
  ] = await Promise.all([
    getCockpitSummaryWithRetry(),
    getFeaturedClip(),
    getRecentEpisodes(6),
    getRecentSearches(5),
    getAutoSyncSummary(),
    getUsageStats(),
    getDashboardLiveSnapshot(),
  ]);

  const isDemo = getDataMode() === "demo";

  return (
    <DashboardShell
      isDemo={isDemo}
      server={{
        cockpit,
        featuredClip,
        recentEpisodes,
        recentSearches,
        autoSync,
        usage,
        liveSnapshot,
      }}
    />
  );
}
