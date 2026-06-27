import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

/**
 * Stop syncing a source: turns off auto-sync, cancels queued jobs/downloads,
 * and resets sync status to idle.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      cancelledJobs: 0,
      cancelledDownloads: 0,
    });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const source = await db.source.findUnique({ where: { id: params.id } });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const { stopSourceSync } = await import("@/lib/queue");
  const result = await stopSourceSync(params.id);

  return NextResponse.json({ ok: true, demo: false, ...result });
}
