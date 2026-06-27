import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Live usage snapshot for the dashboard card's polling. */
export async function GET() {
  const usage = await getUsageStats();
  return NextResponse.json(usage);
}
