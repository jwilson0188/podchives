import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";
import { getDemoEpisode, getDemoSegmentsForEpisode } from "@/lib/demoData";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (IS_DEMO_MODE || !hasDatabase()) {
    const ep = getDemoEpisode(params.id);
    if (!ep) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      episode: ep,
      segments: getDemoSegmentsForEpisode(params.id),
      demo: true,
    });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const episode = await db.episode.findUnique({
    where: { id: params.id },
    include: { podcast: true, source: true },
  });
  if (!episode) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const segments = await db.transcriptSegment.findMany({
    where: { episodeId: params.id },
    orderBy: { startTimeSeconds: "asc" },
  });
  return NextResponse.json({ episode, segments, demo: false });
}
