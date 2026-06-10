import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/lib/constants";
import { hasDatabase } from "@/lib/db";
import { demoDownloads } from "@/lib/demoData";

export async function GET() {
  if (IS_DEMO_MODE || !hasDatabase()) {
    return NextResponse.json({ downloads: demoDownloads, demo: true });
  }
  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const downloads = await db.download.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ downloads, demo: false });
}
