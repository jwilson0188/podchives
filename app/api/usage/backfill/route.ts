import { NextResponse } from "next/server";
import { getBackfillEstimate } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Backfill cost estimate for dashboard hint + usage page polling. */
export async function GET() {
  const backfill = await getBackfillEstimate();
  return NextResponse.json(backfill);
}
