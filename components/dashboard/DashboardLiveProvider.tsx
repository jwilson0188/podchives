"use client";

import { createContext, useCallback, useContext } from "react";
import type { DashboardLiveSnapshot } from "@/lib/data";
import { liveSnapshotLooksEmpty } from "@/lib/dashboardCache";
import { useLivePoll } from "@/hooks/useLivePoll";

const DashboardLiveContext = createContext<DashboardLiveSnapshot | null>(null);

export function DashboardLiveProvider({
  initial,
  enabled,
  children,
}: {
  initial: DashboardLiveSnapshot;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const acceptLiveUpdate = useCallback(
    (prev: DashboardLiveSnapshot, next: DashboardLiveSnapshot) => {
      if (liveSnapshotLooksEmpty(next) && !liveSnapshotLooksEmpty(prev)) {
        return false;
      }
      return true;
    },
    [],
  );

  const { data } = useLivePoll(
    "/api/dashboard/live",
    initial,
    15_000,
    enabled,
    acceptLiveUpdate,
  );

  return (
    <DashboardLiveContext.Provider value={data}>
      {children}
    </DashboardLiveContext.Provider>
  );
}

export function useDashboardLive(): DashboardLiveSnapshot {
  const ctx = useContext(DashboardLiveContext);
  if (!ctx) {
    throw new Error(
      "useDashboardLive must be used within DashboardLiveProvider",
    );
  }
  return ctx;
}
