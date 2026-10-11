import { NextResponse } from "next/server";
import { getDownloadManagerSnapshot } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET() {
  const snapshot = await getDownloadManagerSnapshot();
  return NextResponse.json(snapshot.error ? { error: snapshot.error } : snapshot, {
    status: snapshot.error ? 503 : 200, headers: { "Cache-Control": "no-store" },
  });
}
