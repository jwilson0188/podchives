import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Retry queued (demo).",
    });
  }
  const { retryFailedJob } = await import("@/lib/queue");
  const job = await retryFailedJob(params.id);
  return NextResponse.json({ ok: true, demo: false, job });
}
