import { getDb } from "../lib/db";
import { keywordSearch } from "../lib/search";

async function main() {
  getDb();
  const q = process.argv[2] ?? "culture";
  const results = await keywordSearch(q, { limit: 5 });
  console.log(`Search "${q}": ${results.length} hits`);
  for (const r of results) {
    console.log(`- ${r.episodeTitle} @ ${r.startTimeSeconds}s: ${r.transcriptText.slice(0, 100)}…`);
  }
  const db = getDb();
  await db.$disconnect();
}

main();
