# Podchives environment setup

Baseline `cf83fa6`, audited 2026-10-09. This file lists names, requirements and commands, never actual secret values. Existing `.env` was preserved. Commands below describe operation; real ingestion/schema writes/provider calls require an explicitly authorized target and scope.

## Services and runtime

| Mode / capability | Required |
| --- | --- |
| Demo web | Node/npm, installed locked packages; no database or API keys |
| Real catalog/queue/keyword search | PostgreSQL with pgvector matching `prisma/schema.prisma`; initialized schema; web and worker connect to same DB |
| YouTube discovery/captions | Worker with yt-dlp, ffmpeg (caption conversion), Deno/EJS support as configured in `lib/youtube.ts`; external network access; cookies may be needed |
| Audio transcription | Download/extraction tools + ffprobe; Groq or OpenAI key depending on backend; writable scratch disk |
| Segment embeddings / semantic queries | OpenAI key; `text-embedding-3-small` 1536-d vectors; semantic queries are provider calls too |
| Reliable large search | Reviewed GIN FTS/HNSW cosine indexes from `scripts/create-search-indexes.ts`; deployed presence currently unknown |
| Beta access gate | Nonempty `BETA_PASSWORD` on real shared web deployments |
| Durable media/export | Not implemented; setting `STORAGE_BUCKET` does not create an adapter |

README specifies Node20+. Docker uses Node20; verification used Node22.13.0/npm10.9.2. Test the intended container runtime before release. Packages already installed matched the lockfile. Docker remains unavailable. Milestone 1B installed Homebrew PostgreSQL 17.11 and pgvector 0.8.7 plus dependencies; its native temporary-cluster tests pass. Homebrew's newly initialized default cluster was never started or used; no service was registered/started by this task.

## Environment variable reference

| Name | Consumed by / requirement | Current behavior/default |
| --- | --- | --- |
| `DATABASE_URL` | Real web + all worker/script data paths | Postgres connection string. `lib/db.ts` adds connection_limit=1 and pgbouncer=true when port is 6543. Missing URL can silently switch web views to demo. |
| `NEXT_PUBLIC_DEMO_MODE` | Web/server fixture branching | Default `true`; set explicitly for build/runtime. Worker does **not** use this as a safeguard against processing live data. |
| `BETA_PASSWORD` | Web middleware/login | Optional locally; nonempty gates app, empty leaves it open. No separate session secret is consumed. |
| `OPENAI_API_KEY` | Embeddings, semantic queries, OpenAI audio backend | Required for current normal final embedding stage even when captions are free. |
| `GROQ_API_KEY` | Worker Groq audio transcription | Required only when chosen backend actually needs Groq audio fallback. |
| `TRANSCRIPTION_BACKEND` | Worker resolver and queue predicates | `youtube_captions_then_groq` default; `groq` or `openai` select direct audio. Unknown strings silently use default. Keep processes consistent. |
| `YOUTUBE_COOKIES_FILE` | Worker yt-dlp cookie seed | Path to exported cookie jar. Not the file contents. Render blueprint points at a secret file. |
| `YOUTUBE_COOKIES_PERSIST_FILE` | Worker writable cookie copy | Default `<cwd>/storage/youtube-cookies.txt`; shared by yt-dlp invocations. Ephemeral without a durable mount. |
| `YOUTUBE_COOKIES_FROM_BROWSER` | Local yt-dlp | Alternative browser cookie source; browser option takes precedence over seed file. Requires access to that local browser profile. |
| `YOUTUBE_YTDLP_SLEEP_INTERVAL` | Worker yt-dlp args | Default 1 second; code adds max-sleep-interval 5. Validate custom values for tool compatibility. |
| `WORKER_CONCURRENCY` | Continuous worker lanes | Code default 1; `.env.example` 8; Render blueprint 10. Use 1 for isolated verification. |
| `AUTO_SYNC_ENABLED` | Continuous worker master switch | Default true unless exactly false (case insensitive). Doesn't block initial/manual sync or existing queue processing. |
| `AUTO_SYNC_INTERVAL_MINUTES` | Continuous worker due-source check | Default 360; blueprint 30. Source.autoSync must also be true. |
| `MAX_EPISODES_QUEUED_PER_SYNC` | YouTube admission | Default 50; bounds newly queued pipelines, not discovered catalog entries. |
| `MAX_EPISODES_QUEUED_PER_SYNC_RSS` | RSS admission | Default 100, falls back to generic env if set. |
| `MAX_QUEUED_EPISODES_PER_SOURCE` | YouTube queue pressure | Default 50. |
| `MAX_QUEUED_EPISODES_PER_SOURCE_RSS` | RSS queue pressure | Default 75, falls back to generic env if set. |
| `MAX_INFLIGHT_EPISODES_PER_SOURCE` | YouTube admission pressure | Default 15. Check is at enqueue time, not a hard per-claim concurrency cap. |
| `MAX_INFLIGHT_EPISODES_PER_SOURCE_RSS` | RSS admission pressure | Default 20, falls back to generic env if set. |
| `PROCESSING_MODE` | Labels/config constant | Default local. Values don't select or launch a runner; Docker always starts the continuous worker. |
| `OVERNIGHT_PROCESSING_ENABLED` | Separate scheduler daemon | Default false; no effect on continuous runner. |
| `OVERNIGHT_START_TIME` | Separate scheduler daemon | Default 02:00, interpreted in host-local timezone. |
| `MAX_JOBS_PER_RUN` | `process-queue` / scheduler runOnce | Default 3; ignored by continuous runner. Counts jobs, not completed episodes. |
| `STORAGE_BUCKET` | Reserved only | No live storage adapter consumes it. |
| `RENDER_API_KEY` | Existing Cursor MCP tooling | Not consumed by application/worker code. Don't give it to web/worker just for runtime startup. |
| `NODE_ENV` | Next/runtime/error logging | Usually set by commands/platform. |
| `NEXT_TELEMETRY_DISABLED` | Next tooling | Optional tooling flag used for audit build, not business configuration. |
| `TRANSCRIPT_TEST_DATABASE_URL` | Opt-in integrity integration suite only | Explicit disposable PostgreSQL/pgvector target; never falls back to DATABASE_URL or .env. |
| `TRANSCRIPT_TEST_DB_IS_DISPOSABLE` | Integration safety assertion | Must equal 1 when a test URL is supplied; target must be disposable and already initialized. |
| `PODCHIVES_TEST_PG_BIN` | Native disposable test runner | Optional directory containing initdb, pg_ctl, psql and createdb. Runner also checks Homebrew PostgreSQL17 paths and PATH. |

Local name-only inspection found DATABASE_URL, OPENAI_API_KEY, GROQ_API_KEY, BETA_PASSWORD and RENDER_API_KEY populated. Their values/validity were not tested or reported. Local config also has **`YOUTUBE_COOKIES_FROM_FILE`**, which the application does not read. The supported name is **`YOUTUBE_COOKIES_FILE`**. No environment was changed to fix that during this audit. Local TRANSCRIPTION_BACKEND/WORKER_CONCURRENCY/AUTO_SYNC options were not present in that inventory, so code defaults apply unless injected externally.

Keep separate web/worker env configuration explicit. A web Settings page cannot verify Render secrets or worker runtime values. NEXT_PUBLIC variables can be compiled into client assets; supply the intended demo flag when building as well as running.

## Safe local demo startup

From the repository root:

```sh
# Create only when absent; do not overwrite an existing configured .env.
if [ ! -e .env ]; then cp .env.example .env; fi
npm ci
NEXT_PUBLIC_DEMO_MODE=true BETA_PASSWORD='' NEXT_TELEMETRY_DISABLED=1 npm run dev
```

`npm ci` runs the Prisma generate postinstall, not a database migration. It requires registry access; an already-installed tree can be checked with `npm ls --depth=0`. No dependency reinstall was needed for this audit. Demo source writes are acknowledgments, not durable test data. Never start `npm run worker` as part of a demo-only smoke test.

Safe build used for this audit:

```sh
DATABASE_URL='postgresql://audit:audit@127.0.0.1:1/audit?connect_timeout=1' \
NEXT_PUBLIC_DEMO_MODE=true BETA_PASSWORD='' OPENAI_API_KEY='' GROQ_API_KEY='' \
RENDER_API_KEY='' NEXT_TELEMETRY_DISABLED=1 npm run build
```

The credential-looking strings above are dummy loopback placeholders, not secrets. Override any additional provider/tooling secret variables in isolated verification environments. No real DB/provider access is needed for this demo build.

## Transcript integrity verification

`npm run test:postgres` is the preferred reproducible command. It uses the existing Node/tsx test framework and real native PostgreSQL, creating a fresh isolated cluster for every invocation. On a Mac without the runtime, install it once (Homebrew also installs/upgrades required OS packages; no brew service is needed):

```sh
HOMEBREW_NO_AUTO_UPDATE=1 brew install postgresql@17 pgvector
npm run test:postgres
```

For another installed PostgreSQL/pgvector distribution, set PODCHIVES_TEST_PG_BIN to the directory containing its initdb/pg_ctl/psql/createdb binaries. The vector extension must be installed for that PostgreSQL major. Run as a normal user; PostgreSQL refuses to initialize as root. Restricted agent environments need permission to launch native processes and bind loopback sockets.

The runner never accepts DATABASE_URL or TRANSCRIPT_TEST_DATABASE_URL as a target. It chooses a new directory under the OS temp directory and unused 127.0.0.1 port, creates random SCRAM credentials, removes ambient PG connection settings, and overrides both database URL variables for child processes. It copies the repository schema into the temporary directory before Prisma db push so CLI provisioning does not load the repository .env. It verifies the server's actual data directory, initializes pgvector and matching GIN/HNSW indexes, and runs the unit + integration suites. No continuous worker or provider is called. Cleanup checks that fixture tables are empty, stops only its own cluster and removes that directory. If stopping fails, cleanup preserves the directory for diagnosis rather than deleting a running database.

**Milestone 1B result:** PostgreSQL 17.11 / pgvector 0.8.7, 47 unit cases + 12 database cases passed (Node reports 60 including parent test), zero skips/failures. Real foreign-key and injected callback failure rollback, two distinct sessions observed blocked on an Episode lock, stale completion rejection, metadata/job publication and FTS/vector readiness passed. Fixture tables had zero rows afterward and server/temp-cluster cleanup completed. The Homebrew runtime remains installed; the disposable clusters do not.

**Milestone 2 result (2026-10-10):** 80 unit cases (47 integrity + 8 rendering + 25 caption parsing) and 12 real PostgreSQL cases pass, 93 including parent, zero skips/failures. The same fixture cleanup/server removal succeeded. Typecheck, schema validation, targeted lint and the safe demo build also pass. No migration or new dependencies.

**M3 downstream publication result (2026-10-10):** 97 unit + 23 real PostgreSQL cases, 121 including parent, zero failures/skips. Real embedding/indexing rollback, same/different-job finisher contention, idempotency and late-failure preservation pass. No migration/dependencies.

**M3 media handoff continuation:** 117 unit + 36 real PostgreSQL cases, 154 including parent, zero failures/skips. All five test files run via the disposable runner, including media rollback and concurrent maintenance/completion. No schema/dependency change.

**Admission/resume continuation:** 127 unit + 47 database cases, 175 including parent, zero skips/failures. Six test files run; source-lock contention and real segmentation claim eligibility are covered. No schema changes.

`npm test` without a test URL runs the 127 unit cases and skips integration. It does not instantiate the application database client. No hosted transcription/embedding requests run.

To run real rollback/locking/FTS checks, privately export `TRANSCRIPT_TEST_DATABASE_URL` for an **explicitly disposable**, already initialized database matching `prisma/schema.prisma` with pgvector(1536), then:

```sh
# Require a deliberately selected test URL; never use the app's DATABASE_URL.
: "${TRANSCRIPT_TEST_DATABASE_URL:?Set a disposable test database URL privately}"
TRANSCRIPT_TEST_DB_IS_DISPOSABLE=1 npm test
```

The suite overrides Prisma's datasource explicitly. It creates randomly named fixture Podcasts with Source/Episode/segment/job rows, injects failures inside real transactions, compares prior vectors/flags/jobs, tests concurrent replacements and FTS visibility, and deletes only its own fixture Podcasts by ID on cleanup. Vectors are deterministic fixtures, without provider calls. The suite itself runs no reset, truncate, migration or index DDL; the native runner provisions schema/indexes only on the cluster it creates. A URL without the disposable assertion fails instead of silently using production. Do not set the assertion for a shared/production target.

Milestone 1 requires **no database migration**. Integration provisioning for an empty database is a separate target-specific operation described below; never apply it to the existing application database as a verification shortcut.

## Real local/staging startup — only on an identified target

1. Select a disposable/staging PostgreSQL database, verify its host/role privately, and obtain consent before any production schema/data operation. Use the installed pgvector version appropriate to the desired HNSW support. Migration commands need DDL permissions; app/worker roles should be scoped separately in a production design.
2. Set DATABASE_URL, NEXT_PUBLIC_DEMO_MODE=false and BETA_PASSWORD privately. Set TRANSCRIPTION_BACKEND explicitly. Add worker provider keys and supported cookie path/browser option. Avoid pasting values into chat, logs or committed files.
3. For an empty disposable DB only, review/apply extension and schema setup. No checked-in migration history currently exists:

```sh
# Execute this SQL on the explicitly selected disposable DB:
# CREATE EXTENSION IF NOT EXISTS vector;
npm run db:generate
npm run db:push
# Review before creating indexes; --check is read-only:
node --import tsx scripts/verify-db.ts
node --import tsx scripts/create-search-indexes.ts --check
# Writes indexes and ANALYZE; only after approval on the selected target:
# node --import tsx scripts/create-search-indexes.ts
```

Do not use db:push, db:migrate, ad hoc ALTER scripts, seed or reset as an audit check on production. The ALTER scripts force port6543, so don't run them blindly against generic local Postgres. A baseline migration must be designed against actual live state before rollout.

4. Start web with `npm run dev`. For bounded ingestion, source autoSync must be off, AUTO_SYNC_ENABLED=false, WORKER_CONCURRENCY=1 and per-sync/source caps=1. Use an individual video, not a channel, and an isolated queue; listing bounds are otherwise absent. Existing production rows may still be processed regardless of these admission caps.
5. Only after approval for real processing/provider spend, start the worker in a separate terminal:

```sh
AUTO_SYNC_ENABLED=false WORKER_CONCURRENCY=1 npm run worker
```

If the tsx CLI is blocked by local IPC sandboxing, the runtime-equivalent entry is:

```sh
AUTO_SYNC_ENABLED=false WORKER_CONCURRENCY=1 node --import tsx scripts/dev-worker.ts
```

The continuous runner has no MAX_JOBS_PER_RUN bound. Do not start it against an unknown/shared queue. `npm run process-queue` has a job limit but also requeues failed jobs and currently ignores worker pause/user-cancel semantics; it is not a safer read-only check.

## Command side effects

| Command | Effect |
| --- | --- |
| `npm run typecheck`, `prisma validate` | Local verification; no DB changes |
| `npm test` without TRANSCRIPT_TEST_DATABASE_URL | Deterministic integrity tests only; integration suite skipped, no provider/DB calls |
| `npm run test:postgres` | Creates a new authenticated loopback cluster, provisions its schema/indexes, runs all six test files, verifies fixture cleanup, stops/removes that cluster; ignores existing URLs as targets |
| `npm test` with explicit disposable test URL + acknowledgment | Creates/deletes only randomly named test Podcast fixtures and their own cascaded rows; no DDL, reset, archive download or providers |
| `npm run build`, `npm run db:generate` | Generated client/build files; no migration |
| `npm run lint` | Currently prompts for config; do not auto-accept changes during audit |
| `scripts/verify-db.ts`, `scripts/create-search-indexes.ts --check`, `scripts/systems-check.ts` | Database reads; existing diagnostics can emit raw errors/internal names, so sanitize before sharing |
| `npm run db:push`, `npm run db:migrate`, `scripts/migrate-*.ts`, index script without --check | Schema/index writes |
| `npm run seed` | Writes demo data into configured DB |
| `npm run worker`, `npm run process-queue` | Claims/mutates queue, downloads and provider calls |
| `npm run sync-source -- <url>`, `npm run sync-rss -- <url>` | Creates/syncs source and catalog, queues processing; potentially whole-source discovery |
| `scripts/test-transcribe.ts <path>` | Real paid hosted transcription; not a unit test |
| queue/recover/reset/caption-regeneration scripts | Mutate live flags/jobs/transcripts; some overwrite data or re-embed; inspect each before use |

## Verification and troubleshooting

- Milestone 1B typecheck, schema validation, 47 unit + 12 real PostgreSQL cases, targeted lint and demo build pass. Use npm run test:postgres for a fresh disposable DB with no skips. Lint config/CI remain absent; project-wide baseline has 23 lint errors. See CURRENT_STATE.
- Before live startup, confirm actual table columns, extension/vector dimension and FTS/vector index definitions. Generate is not migration; indexing job is not index creation.
- Missing/empty sources can indicate demo mode, no DB, a failed query, or a stale client cache. Do not infer deletion or automatically reset data. Inspect sanitized errors and explicitly confirm the target first.
- Prior docs recommend web transaction pooler (port6543) and worker session/direct connections. `lib/db.ts` normalizes those parameters. Actual compatibility, saturation and max clients must be verified against the chosen service; historical port instructions alone do not diagnose every failure.
- Cookie diagnostics are logged once per process; supported file name/env and file availability matter. Do not output/export cookies in chat or commit them. No cookies were fetched/copied during this audit.
- `queued` caption transcription is now SQL-eligible without audio. A valid caption transcript can have null audioFilePath; never run legacy recovery resets merely on that condition.
- Render local audio paths can survive in DB after files disappear. Transcription failures after redeploy need media reacquisition, not blind retries against the stale path.
- Deployment verification still needed: worker build/runtime on Node20, yt-dlp/Deno/EJS/curl-cffi operation, memory at configured concurrency, graceful pause/shutdown, schema/index rollout, and exact deployed Git revision. No deploy is authorized by this document.
