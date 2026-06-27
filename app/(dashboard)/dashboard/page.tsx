import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  getAutoSyncSummary,
  getActiveProcessingJobs,
  buildLiveSnapshot,
  getBackfillEstimate,
  getCockpitSummaryWithRetry,
  getDataMode,
  getFeaturedClip,
  getRecentEpisodes,
  getRecentSearches,
  getUsageStats,
} from "@/lib/data";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const cockpit = await getCockpitSummaryWithRetry();
  const activeJobs = await getActiveProcessingJobs();
  const liveSnapshot = buildLiveSnapshot(cockpit, activeJobs);

  const [featuredClip, recentEpisodes, recentSearches, autoSync, usage, backfill] =
    await Promise.all([
      getFeaturedClip(),
      getRecentEpisodes(6),
      getRecentSearches(5),
      getAutoSyncSummary(),
      getUsageStats(),
      getBackfillEstimate(),
    ]);

  const isDemo = getDataMode() === "demo";

  return (
    <DashboardShell
      isDemo={isDemo}
      backfill={backfill}
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
