import { NextResponse } from "next/server";
import {
  buildLiveSnapshot,
  getActiveProcessingJobs,
  getAutoSyncSummary,
  getCockpitSummaryWithRetry,
  getFeaturedClip,
  getRecentEpisodes,
  getRecentSearches,
  getUsageStats,
} from "@/lib/data";

export const dynamic = "force-dynamic";

/** Full dashboard payload for client-side recovery when SSR returns empty. */
export async function GET() {
  const cockpit = await getCockpitSummaryWithRetry();
  const activeJobs = await getActiveProcessingJobs();
  const [featuredClip, recentEpisodes, recentSearches, autoSync, usage] =
    await Promise.all([
      getFeaturedClip(),
      getRecentEpisodes(6),
      getRecentSearches(5),
      getAutoSyncSummary(),
      getUsageStats(),
    ]);

  return NextResponse.json({
    cockpit,
    featuredClip,
    recentEpisodes,
    recentSearches,
    autoSync,
    usage,
    liveSnapshot: buildLiveSnapshot(cockpit, activeJobs),
  });
}
