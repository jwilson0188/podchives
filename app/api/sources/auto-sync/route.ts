import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

/**
 * Global auto-sync master switch — enable/disable scheduled re-syncing for
 * every source at once. Body: { enabled: boolean }.
 *
 * Per-source toggles live at /api/sources/[id]/auto-sync.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);

  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({ ok: true, demo: true, enabled });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();

  const result = await db.source.updateMany({ data: { autoSync: enabled } });

  return NextResponse.json({ ok: true, demo: false, enabled, updated: result.count });
}
