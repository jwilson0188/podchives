import { NextResponse } from "next/server";
import { getProcessingJobs } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Live processing queue buckets for client polling. */
export async function GET() {
  const bucket = await getProcessingJobs();
  return NextResponse.json(bucket);
}
