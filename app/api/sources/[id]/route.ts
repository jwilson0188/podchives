import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

/**
 * Delete a source and everything derived from it: episodes, transcript
 * segments, downloads, and queued jobs all cascade. If this was the last
 * source feeding its archive (podcast), the now-empty archive is removed too.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const source = await db.source.findUnique({
    where: { id: params.id },
    select: { id: true, podcastId: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // source_sync jobs reference the source directly (SetNull on delete) — remove
  // them explicitly so no orphaned jobs linger in the queue.
  await db.processingJob.deleteMany({ where: { sourceId: params.id } });
  // Episodes (and their segments/downloads/jobs) cascade via FK on delete.
  await db.source.delete({ where: { id: params.id } });

  // Clean up the archive if nothing else feeds it.
  const remaining = await db.source.count({
    where: { podcastId: source.podcastId },
  });
  let removedArchive = false;
  if (remaining === 0) {
    await db.podcast
      .delete({ where: { id: source.podcastId } })
      .then(() => {
        removedArchive = true;
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, demo: false, removedArchive });
}
