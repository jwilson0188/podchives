/** Fresh native PostgreSQL cluster for integrity tests; never consumes an existing DB URL. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.PODCHIVES_TEST_PG_BIN,
  "/opt/homebrew/opt/postgresql@17/bin",
  "/usr/local/opt/postgresql@17/bin",
  ...(process.env.PATH ?? "").split(delimiter),
].filter(Boolean);
const pgBin = candidates.find((dir) => ["initdb", "pg_ctl", "psql", "createdb"].every((bin) => existsSync(join(dir, bin))));
if (!pgBin) throw new Error("PostgreSQL binaries unavailable: install PostgreSQL + pgvector, then set PODCHIVES_TEST_PG_BIN to its bin directory.");

const directory = mkdtempSync(join(tmpdir(), "podchives-integrity-"));
const data = join(directory, "data");
const password = randomBytes(24).toString("hex");
const passwordFile = join(directory, "password");
const database = "podchives_integrity_test";
const user = "podchives_test";
let env;
let started = false;
let cleaned = false;

function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: directory, env, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(password, "[test password]");
  if (!options.quiet && output) process.stdout.write(output);
  if (result.error || result.status !== 0) throw new Error(`${file.split("/").at(-1)} failed (${result.status ?? result.error?.code ?? "unknown"})`);
  return output.trim();
}

function cleanup() {
  if (cleaned) return;
  if (started || existsSync(join(data, "postmaster.pid"))) {
    // Stop only the cluster created in this invocation's fresh directory.
    run(join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "-t", "20", "stop"]);
    started = false;
  }
  rmSync(directory, { recursive: true, force: true });
  cleaned = true;
  console.log("Disposable PostgreSQL stopped and its temporary cluster removed.");
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  try { cleanup(); } finally { process.exit(signal === "SIGINT" ? 130 : 143); }
});

try {
  // Reserve an unused loopback port; PostgreSQL will fail safely if another
  // process takes it before startup. No connection to that process is attempted.
  const port = await new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const selected = server.address().port;
      server.close((error) => error ? reject(error) : accept(selected));
    });
  });
  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?connection_limit=4&connect_timeout=5`;
  // Remove ambient PostgreSQL settings; inject only this invocation's target.
  env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
  Object.assign(env, {
    DATABASE_URL: url, TRANSCRIPT_TEST_DATABASE_URL: url, TRANSCRIPT_TEST_DB_IS_DISPOSABLE: "1",
    PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: user, PGPASSWORD: password, PGDATABASE: database,
    OPENAI_API_KEY: "", GROQ_API_KEY: "", RENDER_API_KEY: "", BETA_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1",
  });
  writeFileSync(passwordFile, password, { mode: 0o600 });
  run(join(pgBin, "initdb"), ["-D", data, "-U", user, "--auth=scram-sha-256", `--pwfile=${passwordFile}`, "--encoding=UTF8", "--locale=C"]);
  const logfile = join(directory, "postgres.log");
  try {
    run(join(pgBin, "pg_ctl"), ["-D", data, "-l", logfile, "-o", `-h 127.0.0.1 -p ${port} -k ${directory} -c max_connections=20`, "-w", "-t", "20", "start"]);
    started = true;
  } catch (error) {
    if (existsSync(logfile)) process.stderr.write(readFileSync(logfile, "utf8").replaceAll(password, "[test password]"));
    throw error;
  }
  run(join(pgBin, "createdb"), [database]);
  // Copy only the schema into the temp directory, so Prisma CLI cannot load
  // the repository .env. This new database is empty and owned by this runner.
  const schema = join(directory, "schema.prisma");
  copyFileSync(join(root, "prisma/schema.prisma"), schema);
  run(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "db", "push", "--schema", schema, "--skip-generate"]);
  const sql = (query) => run(join(pgBin, "psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-Atc", query], { quiet: true });
  console.log(`Verified server: PostgreSQL ${sql("SHOW server_version")}, pgvector ${sql("SELECT extversion FROM pg_extension WHERE extname='vector'")}`);
  if (sql("SHOW data_directory") !== data) throw new Error("Unexpected PostgreSQL cluster: refusing tests");
  // Same expression/opclass used by scripts/create-search-indexes.ts.
  sql("CREATE INDEX transcript_segments_fts_idx ON transcript_segments USING gin (to_tsvector('english', transcript_text))");
  sql("CREATE INDEX transcript_segments_embedding_idx ON transcript_segments USING hnsw (transcript_embedding vector_cosine_ops)");
  console.log("Fresh schema, GIN FTS and HNSW vector indexes ready; running unit + PostgreSQL suites.");
  run(process.execPath, ["--import", "tsx", "--test", "tests/transcript-integrity.test.ts", "tests/transcript-integrity.integration.test.ts", "tests/transcript-display.test.ts", "tests/youtube-captions.test.ts", "tests/queue-transitions.test.ts", "tests/download-snapshot.test.ts", "tests/queue-polling.test.ts", "tests/processing-job-controls.test.ts", "tests/queue-admission.test.ts"], { cwd: root });
  const remaining = sql("SELECT (SELECT count(*) FROM podcasts) + (SELECT count(*) FROM sources) + (SELECT count(*) FROM episodes) + (SELECT count(*) FROM transcript_segments) + (SELECT count(*) FROM processing_jobs)");
  if (remaining !== "0") throw new Error("Integration fixtures were not fully cleaned up");
  console.log("Fixture cleanup verified: 0 podcast/source/episode/transcript/job rows remain.");
} finally {
  cleanup();
}
