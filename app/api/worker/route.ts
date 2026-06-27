import { NextResponse } from "next/server";
import { z } from "zod";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";

export async function GET() {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      enabled: true,
      queuedCount: 0,
      activeCount: 0,
      lastRunAt: null,
      demo: true,
    });
  }

  const { getWorkerStatus } = await import("@/lib/workerControl");
  const status = await getWorkerStatus();
  return NextResponse.json(status);
}

const BodySchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      enabled: parsed.data.enabled,
      message: parsed.data.enabled
        ? "Worker started (demo mode)."
        : "Worker stopped (demo mode).",
    });
  }

  const { setWorkerEnabled, getWorkerStatus } = await import(
    "@/lib/workerControl"
  );
  await setWorkerEnabled(parsed.data.enabled);
  const status = await getWorkerStatus();
  return NextResponse.json({
    ok: true,
    ...status,
    message: parsed.data.enabled
      ? "Worker started — queued jobs will process."
      : "Worker stopped — in-flight jobs may finish; nothing new will start.",
  });
}
