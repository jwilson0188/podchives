import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { getDb, hasDatabase } from "@/lib/db";
import { JobRetryError } from "@/lib/jobControl";
import { stopDownloadEpisode } from "@/lib/downloadControl";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (IS_DEMO_MODE || !hasDatabase()) return NextResponse.json({ ok: true, demo: true });
  try {
    const result = await stopDownloadEpisode(getDb(), params.id);
    return NextResponse.json({ ok: true, demo: false, result });
  } catch (error) {
    if (error instanceof JobRetryError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to update the download. Please try again." }, { status: 503 });
  }
}
