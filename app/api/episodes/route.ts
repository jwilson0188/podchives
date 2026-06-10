import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";
import { demoEpisodes } from "@/lib/demoData";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const archive = url.searchParams.get("archive");
  const status = url.searchParams.get("status");

  if (IS_DEMO_MODE || !hasDatabase()) {
    let episodes = demoEpisodes;
    if (archive) episodes = episodes.filter((e) => e.podcastId === archive);
    if (status === "searchable")
      episodes = episodes.filter((e) => e.isSearchable);
    if (status === "failed")
      episodes = episodes.filter((e) => e.processingStatus === "failed");
    return NextResponse.json({ episodes, demo: true });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const episodes = await db.episode.findMany({
    where: {
      ...(archive ? { podcastId: archive } : {}),
      ...(status === "searchable" ? { isSearchable: true } : {}),
      ...(status === "failed" ? { processingStatus: "failed" } : {}),
    },
    orderBy: { publishDate: "desc" },
    take: 200,
  });
  return NextResponse.json({ episodes, demo: false });
}
