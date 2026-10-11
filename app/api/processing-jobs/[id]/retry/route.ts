import { JobRetryError } from "@/lib/jobControl";
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
      message: "Demo preview only — no job was queued.",
    });
  }
  const { retryFailedJob } = await import("@/lib/queue");
  try {
    const job = await retryFailedJob(params.id);
    return NextResponse.json({ ok: true, demo: false, job });
  } catch (error) {
    if (error instanceof JobRetryError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
