"use client";

import { PipelineStrip } from "./PipelineStrip";
import { useDashboardLive } from "./DashboardLiveProvider";

export function LivePipelineStrip() {
  const live = useDashboardLive();

  return (
    <PipelineStrip
      stats={live.stats}
      transcribedEpisodes={live.transcribedEpisodes}
      coveragePercent={live.coveragePercent}
      backlogEpisodes={live.backlogEpisodes}
    />
  );
}
