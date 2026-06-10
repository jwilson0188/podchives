import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";
import { demoProcessingJobs } from "@/lib/demoData";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  if (IS_DEMO_MODE || !hasDatabase()) {
    const jobs = status
      ? demoProcessingJobs.filter((j) => j.status === status)
      : demoProcessingJobs;
    return NextResponse.json({ jobs, demo: true });
  }

  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const jobs = await db.processingJob.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { episode: { select: { episodeTitle: true } } },
  });
  return NextResponse.json({ jobs, demo: false });
}
