/**
 * One-off DDL: add scheduler_settings.worker_enabled. Idempotent.
 * Runs over the transaction-mode pooler (port 6543).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const SQL =
  'ALTER TABLE "scheduler_settings" ADD COLUMN IF NOT EXISTS "worker_enabled" boolean NOT NULL DEFAULT true';

function readDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const match = text.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("DATABASE_URL not found in env or .env");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function txPoolerUrl(): string {
  const url = new URL(readDatabaseUrl());
  url.port = "6543";
  url.searchParams.set("pgbouncer", "true");
  return url.toString();
}

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: txPoolerUrl() } },
    log: ["error"],
  });
  try {
    await prisma.$executeRawUnsafe(SQL);
    console.log("✓ scheduler_settings.worker_enabled ensured");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
