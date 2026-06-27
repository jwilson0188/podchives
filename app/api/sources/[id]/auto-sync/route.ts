import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

/**
 * Toggle automatic re-syncing for a source.
 *
 * When enabled, the background worker periodically re-syncs this source —
 * ingesting newly-published videos and re-queuing any backlog episodes until
 * the whole channel is processed. Body: { enabled: boolean }.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);

  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({ ok: true, demo: true, autoSync: enabled });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const source = await db.source.findUnique({ where: { id: params.id } });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await db.source.update({
    where: { id: params.id },
    data: { autoSync: enabled },
  });

  return NextResponse.json({ ok: true, demo: false, autoSync: enabled });
}
