import { NextResponse } from "next/server";
import { getDashboardLiveSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Lightweight live metrics for dashboard polling (no full page refresh). */
export async function GET() {
  const snapshot = await getDashboardLiveSnapshot();
  return NextResponse.json(snapshot);
}
