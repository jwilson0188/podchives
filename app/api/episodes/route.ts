import { NextResponse } from "next/server";
import { getEpisodes } from "@/lib/data";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const archive = url.searchParams.get("archive") ?? undefined;
  const status = url.searchParams.get("status") as
    | "searchable"
    | "failed"
    | "processing"
    | undefined;

  const episodes = await getEpisodes({
    archiveId: archive,
    status: status || undefined,
  });

  return NextResponse.json({ episodes });
}
