import { NextResponse } from "next/server";
import { getUsagePayload } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Usage stats + backfill estimate for the Usage page. */
export async function GET() {
  const payload = await getUsagePayload();
  return NextResponse.json(payload);
}
