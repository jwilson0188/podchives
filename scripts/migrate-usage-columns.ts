/**
 * One-off DDL: add episodes.audio_bytes and episodes.embedding_tokens for real
 * usage metering. Idempotent. Runs over the transaction-mode pooler (port
 * 6543) to avoid the session pooler's 15-client cap.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const STATEMENTS = [
  'ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "audio_bytes" integer NOT NULL DEFAULT 0',
  'ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "embedding_tokens" integer NOT NULL DEFAULT 0',
];

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
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
    }
    console.log("✓ episodes.audio_bytes + episodes.embedding_tokens ensured");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
