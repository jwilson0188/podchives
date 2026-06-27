/**
 * One-off DDL: add sources.auto_sync. Idempotent.
 *
 * The session-mode pooler (DATABASE_URL, port 5432) is capped at 15 clients
 * and is fully held by the production worker, so we run this single DDL over
 * the transaction-mode pooler (port 6543), which has a much larger budget.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const SQL =
  'ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "auto_sync" boolean NOT NULL DEFAULT false';

function readDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.cwd(), ".env");
  const text = fs.readFileSync(envPath, "utf8");
  const match = text.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("DATABASE_URL not found in env or .env");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function txPoolerUrl(): string {
  const base = readDatabaseUrl();
  const url = new URL(base);
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
    console.log("✓ sources.auto_sync ensured");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
