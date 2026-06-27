import { NextResponse } from "next/server";
import { z } from "zod";
import { IS_DEMO_MODE } from "@/lib/constants";
import { createSource, detectYouTubeSourceType } from "@/lib/youtube";
import { hasDatabase } from "@/lib/db";
import { demoSources } from "@/lib/demoData";

const BodySchema = z.object({
  sourceUrl: z.string().url(),
  sourceType: z
    .enum(["youtube_channel", "youtube_playlist", "youtube_video"])
    .optional(),
  podcastName: z.string().optional(),
});

export async function GET() {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({ sources: demoSources, demo: true });
  }
  const { getSourcesWithRetry } = await import("@/lib/data");
  const sources = await getSourcesWithRetry();
  return NextResponse.json({ sources, demo: false });
}

export async function POST(req: Request) {
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

  const { sourceUrl } = parsed.data;
  const sourceType =
    parsed.data.sourceType ?? detectYouTubeSourceType(sourceUrl);

  // In demo mode (or with no DB) we just acknowledge — no persistence.
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      source: {
        id: `src_demo_${Date.now()}`,
        sourceUrl,
        sourceType,
        syncStatus: "queued",
      },
    });
  }

  try {
    const source = await createSource({
      sourceUrl,
      sourceType,
      sourceName: parsed.data.podcastName,
    });
    return NextResponse.json({ ok: true, demo: false, source });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to create source" },
      { status: 500 },
    );
  }
}
