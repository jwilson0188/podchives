import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";
import { getDemoSegmentsForEpisode } from "@/lib/demoData";

export async function GET(
  _req: Request,
  { params }: { params: { episodeId: string } },
) {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      segments: getDemoSegmentsForEpisode(params.episodeId),
      demo: true,
    });
  }
  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const segments = await db.transcriptSegment.findMany({
    where: { episodeId: params.episodeId },
    orderBy: { startTimeSeconds: "asc" },
  });
  return NextResponse.json({ segments, demo: false });
}
