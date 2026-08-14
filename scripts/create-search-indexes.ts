/**
 * Create the indexes that /lib/search.ts depends on.
 *
 * Neither existed, so both search modes were doing full scans:
 *   - keyword  → to_tsvector() evaluated per row, every query
 *   - semantic → cosine distance against every embedded segment
 *
 * Idempotent; safe to re-run. Run once per database (local, staging, prod):
 *
 *   npx tsx scripts/create-search-indexes.ts          # create + report
 *   npx tsx scripts/create-search-indexes.ts --check  # report only
 */

const FTS_INDEX = "transcript_segments_fts_idx";
const VEC_INDEX = "transcript_segments_embedding_idx";

// Must match the expression in keywordSearch() exactly or Postgres won't use
// the index. The two-argument to_tsvector with a literal config is IMMUTABLE,
// which is what makes an expression index legal here.
const CREATE_FTS = `
  CREATE INDEX IF NOT EXISTS ${FTS_INDEX}
  ON transcript_segments
  USING gin (to_tsvector('english', transcript_text))
`;

// HNSW over cosine distance, matching the `<=>` operator in semanticSearch().
// Chosen over ivfflat: no training pass, and it stays accurate as rows are
// added rather than degrading until the list centroids are rebuilt.
const CREATE_VEC = `
  CREATE INDEX IF NOT EXISTS ${VEC_INDEX}
  ON transcript_segments
  USING hnsw (transcript_embedding vector_cosine_ops)
`;

async function main() {
  const checkOnly = process.argv.includes("--check");

  const { hasDatabase, getDb } = await import("../lib/db");
  if (!hasDatabase()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = getDb();

  const existing = await db.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'transcript_segments'`,
  );
  const names = existing.map((r) => r.indexname);
  console.log("\nExisting indexes:");
  for (const n of names) console.log(`  ${n}`);

  const [counts] = await db.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS segments, count(transcript_embedding)::int AS embedded
     FROM transcript_segments`,
  );
  console.log(
    `\nSegments: ${counts.segments} (${counts.embedded} embedded)`,
  );

  if (checkOnly) {
    console.log("\n--check: nothing created.");
    console.log(`  ${FTS_INDEX}: ${names.includes(FTS_INDEX) ? "present" : "MISSING"}`);
    console.log(`  ${VEC_INDEX}: ${names.includes(VEC_INDEX) ? "present" : "MISSING"}`);
    return;
  }

  if (!names.includes(FTS_INDEX)) {
    console.log(`\nCreating ${FTS_INDEX} …`);
    const t = Date.now();
    await db.$executeRawUnsafe(CREATE_FTS);
    console.log(`  done in ${Date.now() - t}ms`);
  } else {
    console.log(`\n${FTS_INDEX} already present.`);
  }

  if (!names.includes(VEC_INDEX)) {
    console.log(`\nCreating ${VEC_INDEX} (HNSW) …`);
    const t = Date.now();
    try {
      await db.$executeRawUnsafe(CREATE_VEC);
      console.log(`  done in ${Date.now() - t}ms`);
    } catch (err: any) {
      // Older pgvector builds lack hnsw; ivfflat is the fallback.
      console.warn(`  hnsw failed (${err.message}) — trying ivfflat`);
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS ${VEC_INDEX}
        ON transcript_segments
        USING ivfflat (transcript_embedding vector_cosine_ops) WITH (lists = 100)
      `);
      console.log("  ivfflat created");
    }
  } else {
    console.log(`\n${VEC_INDEX} already present.`);
  }

  // Planner needs fresh stats before it will pick the new indexes.
  console.log("\nANALYZE transcript_segments …");
  await db.$executeRawUnsafe(`ANALYZE transcript_segments`);

  const t0 = Date.now();
  await db.$queryRawUnsafe(
    `SELECT id FROM transcript_segments
     WHERE to_tsvector('english', transcript_text)
           @@ websearch_to_tsquery('english', 'faith')
     LIMIT 50`,
  );
  console.log(`\nKeyword query after indexing: ${Date.now() - t0}ms`);

  const plan = await db.$queryRawUnsafe<any[]>(
    `EXPLAIN SELECT id FROM transcript_segments
     WHERE to_tsvector('english', transcript_text)
           @@ websearch_to_tsquery('english', 'faith') LIMIT 50`,
  );
  const usesIndex = plan.some((r: any) =>
    String(Object.values(r)[0]).includes(FTS_INDEX),
  );
  console.log(`Planner uses ${FTS_INDEX}: ${usesIndex ? "yes" : "no"}`);
}

main()
  .catch((err) => {
    console.error("\nFailed:", err.message);
    process.exit(1);
  })
  .then(() => process.exit(0));
