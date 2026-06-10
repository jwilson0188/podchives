/**
 * One-shot health check for a freshly migrated Supabase DB.
 * Prints which tables exist, whether pgvector is installed, and the type
 * of the embedding column. Safe to delete after first deploy.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  const expected = [
    "podcasts",
    "sources",
    "source_sync_jobs",
    "episodes",
    "downloads",
    "processing_jobs",
    "transcript_segments",
    "search_queries",
    "worker_runs",
    "scheduler_settings",
    "users",
  ];

  const found = new Set(rows.map((r) => r.table_name));
  console.log(`\nTables in public schema: ${rows.length}\n`);
  for (const t of expected) {
    console.log(`  ${found.has(t) ? "✓" : "✗"}  ${t}`);
  }

  const ext = await db.$queryRawUnsafe<{ extname: string }[]>(
    `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
  );
  console.log(`\npgvector: ${ext.length > 0 ? "✓ installed" : "✗ MISSING"}`);

  const col = await db.$queryRawUnsafe<any[]>(
    `SELECT udt_name FROM information_schema.columns
     WHERE table_name = 'transcript_segments' AND column_name = 'transcript_embedding'`,
  );
  console.log(
    `transcript_embedding column type: ${col[0]?.udt_name ?? "MISSING"}\n`,
  );

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
