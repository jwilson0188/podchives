import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  getAutoSyncSummary,
  getActiveProcessingJobs,
  buildLiveSnapshot,
  getCockpitSummaryWithRetry,
  getDataMode,
  getFeaturedClip,
  getRecentEpisodes,
  getRecentSearches,
  getUsageStats,
} from "@/lib/data";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [
    cockpit,
    activeJobs,
    featuredClip,
    recentEpisodes,
    recentSearches,
    autoSync,
    usage,
  ] = await Promise.all([
    getCockpitSummaryWithRetry(),
    getActiveProcessingJobs(),
    getFeaturedClip(),
    getRecentEpisodes(6),
    getRecentSearches(5),
    getAutoSyncSummary(),
    getUsageStats(),
  ]);

  const liveSnapshot = buildLiveSnapshot(cockpit, activeJobs);

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
