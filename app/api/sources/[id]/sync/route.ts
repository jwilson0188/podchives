import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

/**
 * Trigger a re-sync of an existing source.
 *
 * In real mode: enqueues a fresh `source_sync` processing job for the
 * worker to pick up. The actual yt-dlp work happens in the worker, not
 * inline — so this returns quickly with the new job id.
 *
 * In demo mode: acknowledges and returns a fake job id.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Sync queued (demo mode).",
      jobId: `job_demo_${Date.now()}`,
    });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const source = await db.source.findUnique({ where: { id: params.id } });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await db.source.update({
    where: { id: params.id },
    data: { syncStatus: "queued" },
  });

  const { createProcessingJob } = await import("@/lib/queue");
  const job = await createProcessingJob({
    sourceId: params.id,
    jobType: "source_sync",
  });

  return NextResponse.json({ ok: true, demo: false, job });
}
