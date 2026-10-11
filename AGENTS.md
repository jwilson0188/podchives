# Podchives engineering instructions

## Scope and current handoff

This is an existing application. Preserve its architecture until you inspect the relevant paths. The engineering handoff is in `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE.md`, `docs/GAP_ANALYSIS.md`, `docs/ROADMAP.md`, and `docs/ENVIRONMENT_SETUP.md` (baseline `cf83fa6`, audited 2026-10-09). Recheck Git state and these assumptions each session; historical `README.md`, `AUDIT.md`, `GO_LIVE.md`, `DEPLOY.md` and `RESUME_TOMORROW.md` contain stale claims.

The user approved Milestone 1, Milestone 1B isolated PostgreSQL verification, and Milestone 2 safe highlighting/conservative caption deduplication. These are complete for their bounded acceptance cases; scope and evidence are in ROADMAP. The founder subsequently approved autonomous routine engineering under `docs/FOUNDER_PROTOCOL.md` (2026-10-10). This supersedes the per-fix approval boundary: continue bug fixes, tests, minor refactors and existing-architecture roadmap implementation without repeated permission. Consult for the protocol's major architecture/product/financial/security decisions and major product checkpoints. Update EXECUTION_LOG and DECISION_LOG as work progresses. Production operations, paid jobs and destructive migrations still need explicit target/action authorization.

## Repository map

- Next.js14 App Router + React18 + strict TypeScript + Tailwind; versions are in package-lock.json. No separate API server.
- `app/(dashboard)/layout.tsx` is force-dynamic and applies the app shell. Root redirects to dashboard; advanced-search redirects to search.
- Server pages read `lib/data.ts`; client mutations/polling use `app/api`. View types currently alias demo types; a `Demo*` type name alone doesn't establish mocked behavior.
- Prisma5/Postgres/pgvector in `prisma/schema.prisma`; lazy client via `getDb()` in `lib/db.ts`. Unsupported vector(1536) uses parameter-bound raw SQL.
- `lib/youtube.ts`: yt-dlp metadata/audio/cookies/source creation; `lib/sourceTypes.ts`: URL heuristics; `lib/rss.ts`: feed and enclosure access.
- `workers/processingWorker.ts`: dispatcher; `lib/queue.ts`: queue and SQL eligibility; `lib/pipeline.ts`: nominal order; `lib/queueTransitions.ts`: serialized media completion/successor/failure; `scripts/dev-worker.ts`: continuous runner.
- `lib/transcription.ts`, `lib/youtubeCaptions.ts`, `lib/rssTranscripts.ts`, `workers/transcriptionWorker.ts`: caption/feed/API transcription and packing; `lib/transcriptIntegrity.ts`: validated transactional persistence and readiness publication.
- `lib/embeddings.ts`, `workers/embeddingWorker.ts`, `lib/search.ts`: OpenAI embeddings, flags, FTS/vector/RRF.
- `render.yaml` deploys a Docker background worker from main; Docker starts npm run worker. Web deployment intent is Vercel; DB intent Supabase. Verify actual deployments before asserting them.

## Safe operation

- Start with `git status --short --branch`, relevant source reads and repository instructions. Preserve unrelated changes. Prefer rg for file/text searches.
- Never cat/print `.env`, cookie jars, tokens, private connection strings, Cursor MCP header values or provider keys. Report variable names/presence only; sanitize errors from diagnostics before sharing. Do not commit generated storage, secrets, media or build artifacts.
- Do not run db push/migrate, seed, schema/index ALTER scripts, queue recovery/reset/regeneration, source sync, workers, archive downloads or hosted provider diagnostics against production without an explicitly authorized target/action. Confirm side effects by reading scripts first.
- `.env` may point at live services. Preserve it. Demo web mode does **not** prevent the continuous worker from processing the configured database.
- A read-only DB audit should use a transaction marked READ ONLY, statement timeouts, aggregate output and sanitized failures. Do not assume database reachability or schema/index presence from env values.
- Never destructively change schema or bulk-reset episode flags to fix incomplete pipeline state. Caption/feed transcripts legitimately have no audio file.
- `STORAGE_BUCKET` is reserved and unused. Worker paths are local/ephemeral, not web URLs or proof that a file exists after redeploy.

## Verification commands and baseline

- Dependencies: `npm ls --depth=0`; use npm ci when needed and authorized. Postinstall generates Prisma, not schema.
- Typecheck: `npm run typecheck` (passed at audit baseline).
- Schema validation: `DATABASE_URL='postgresql://audit:audit@127.0.0.1:1/audit' node_modules/.bin/prisma validate` (passed; dummy URL).
- Safe build: force NEXT_PUBLIC_DEMO_MODE=true, blank BETA_PASSWORD/provider/tooling keys, dummy loopback DATABASE_URL and NEXT_TELEMETRY_DISABLED=1 as documented in ENVIRONMENT_SETUP. Build passed in demo mode; it doesn't verify real data paths.
- `npm run test:postgres`: provisions a fresh native PostgreSQL cluster on an unused loopback port with random SCRAM credentials, copied schema, pgvector/GIN/HNSW; runs all tests; verifies no fixture rows remain; stops/removes the cluster. It never accepts an existing database URL as its target. Set PODCHIVES_TEST_PG_BIN when binaries are not in a supported Homebrew location or PATH. PostgreSQL 17.11 + pgvector 0.8.7 passed 47 unit + 12 integration cases (60 including parent, zero skips) in Milestone 1B. Native process/listener sandbox escalation may be required.
- Current Milestone 2 suite: 80 unit cases (47 integrity, 8 rendered-markup, 25 captions) + 12 real PostgreSQL cases; 93 including parent pass with zero skips via test:postgres. Typecheck/schema validation/targeted lint/safe demo build pass.
- Current M3 downstream publication suite: 97 unit + 23 real PostgreSQL cases (121 including parent), zero skips/failures. See EXECUTION_LOG for checks.
- Current media-handoff continuation suite: 117 unit + 36 real PostgreSQL cases (154 including parent), zero skips/failures.
- Admission/resume continuation: 127 unit + 47 PostgreSQL cases (175 including parent), zero skips/failures.
- Control continuation: 127 unit + 58 PostgreSQL cases (186 including parent), zero failures/skips. Source-sync uses queueControl Source locks; fallback requires job ID and expected segment IDs. Never restore unguarded fallback enqueue.
- Cancellation/retry continuation: 127 unit + 67 PostgreSQL cases (195 including parent), zero failures/skips. jobControl guards worker writes; explicit retry creates a fresh ID and returns 404/409 for invalid requests. Source-worker admission must pass sourceJobId. Never put external work in withActiveJob transactions.
- Processing Queue controls: 137 unit + 67 PostgreSQL cases (205 including parent), zero failures/skips. Use processingJobPresentation for cancellation/supersession display; never show cancelled jobs as ready.
- Queue failure continuation: 142 unit + 67 PostgreSQL cases (210 including parent), zero failures/skips. Queue read errors carry an unavailable marker; live endpoint returns 503/no-store. useQueuePoll preserves the last good snapshot, serializes requests and suppresses disposed results. Do not turn queue DB failures into successful empty buckets.
- `npm test` alone: 142 unit cases; integration skips unless TRANSCRIPT_TEST_DATABASE_URL and TRANSCRIPT_TEST_DB_IS_DISPOSABLE=1 are explicitly supplied. Never substitute DATABASE_URL; only deliberately disposable targets may be used. Actual rollback, two-session contention, stale completion and FTS/readiness have now passed locally; deployed pooler/worker/provider integration remains unverified.
- `npm run lint` currently asks for initial configuration. No committed ESLint config/CI exists. Temporary Next core-web-vitals baseline found 22 helper-name hook-rule reports and one apostrophe error; targeted Milestone 1 files pass. Don't present build's lint phase as a configured project lint check.
- `scripts/test-transcribe.ts` is a paid API call, not a test suite. Use deterministic fixture tests and explicitly isolated Postgres integration tests when implementing substantive pipeline changes.
- Use `node --import tsx path/to/script.ts` if the tsx CLI cannot open its IPC pipe under sandboxing. This changes launch mechanics, not script safety or side effects.
- Docker execution and real DB/provider/YouTube end-to-end flow were not verified during the audit. State verification limits explicitly.

## Pipeline correctness rules

- Keep heavy media/provider work in workers; APIs enqueue. Current order has bypasses for caption/feed transcripts and already-audio paths; don't force all episodes through a download.
- Keep job creation logic, SQL claim predicates and transcription input acceptance consistent. Caption jobs are eligible without audio; the historical caption deadlock has already been addressed in current code.
- Preserve source attribution and fractional timestamps. Validate nonempty text and finite ordered ranges; support valid overlapping cues. Do not remove genuine repeated speech when fixing rolling captions.
- Always use saveTranscriptSegments/persistTranscriptSegments for transcript writes. It validates attribution/timing (two-second known-duration tolerance), locks Episode, rechecks segment IDs, and transacts text/metadata/downstream jobs. Capture expectedSegmentIds before provider/packing work. Never delete old text before validation or bypass the transaction. Append is also validated.
- Readiness writers must use the same Episode lock and current-generation/coverage guards. Replacements mark embeddings/search pending; superseded workers must not cancel the new queue. Transcription/segmentation and embedding → indexing handoffs are atomic; final indexing readiness/job completion is atomic too. Workers must pass jobId to embedding publication and must not separately call completePipelineJob for embedding/indexing. Same-job successful completion is idempotent; reclaimed current indexing jobs are reused; late failure cannot undo committed work. Early media-stage handoffs and maintenance successor enqueue now transact under Episode locks in queueTransitions. Media failure/cancellation uses that lock; completed same-job success cannot be undone by late failure. Initial episode admission locks Source → Episode and uses stage/artifact evidence through queueAdmission; preserve this lock order. Source-sync and fallback admission now serialize in queueControl; durable attempt ownership remains unresolved. Artifact work remains outside transactions. No durable transcript versions/leases exist yet.
- Initial admission uses queueAdmission for source-pressure checks, episode dedup and stage resume. Existing transcript rows outrank media; segmentation eligibility uses row existence to recover inconsistent flags. Use mediaArtifacts for local regular/readable/nonempty file checks; this does not prove codec validity or cross-host/future availability. Never reset caption transcripts because audio is absent. Source-sync createProcessingJob calls route through Source-locked admission. Audio fallback requires current job/generation evidence and commits failure with download admission. Other raw episode createProcessingJob calls still bypass initial-admission guarantees.
- Embedding dimensions must remain consistent with vector(1536). Current indexing worker sets flags, not DB indexes. Indexes need explicit reviewed setup; never assume generation installed them.
- Keep cancellation distinct from failure/success in future changes. Automatic retry excludes stopped/cancelled/superseded jobs; every claim checks global pause and cancellation markers. Source stop now cancels running jobs under Source → ordered Episode locks; guarded workers cannot publish or enqueue afterward. External calls/subprocesses can continue, and automatic retry/reclaim still lack attempt ownership. Don't claim stronger semantics than implemented.
- `highlight` returns React text/mark nodes, rendered as children by search, transcript and dashboard clip views. Never restore a transcript dangerouslySetInnerHTML sink. Regex escaping alone is not HTML escaping.
- VTT parsing preserves repeated dialogue. YouTube opts into deduplication only for identical explicit inline start/end/text in overlapping cues; generic/feed VTT defaults off. Untimed/ambiguous rolling copies remain intentionally. Never infer duplicate speech from text alone or extend old timing across a repeated cue. Invalid cue/inline timing rejects parsing; no stored transcript backfill was performed.
- Parameter-bind raw SQL values. Validate limits/platforms/date inputs; never interpolate arbitrary request data.
- Treat costs/credits as estimates today, not billing or enforced limits. Continuous worker ignores MAX_JOBS_PER_RUN; semantic search creates paid query embeddings.

## UI and change discipline

- Preserve stable memoized search effect dependencies and JSON polling. SearchResultsView no longer restores cached transcript hits and clears old results before no-store retrieval. Do not reintroduce stale search snapshots as current evidence. Already displayed responses remain retrieval snapshots; no live cross-client invalidation exists. Review refresh/polling changes without recreating the known fetch loop.
- Demo behavior must be visibly distinguished from real/degraded behavior. Don't swallow a backend failure into a successful empty archive or search as a new implementation pattern.
- Verify both backend endpoint and UI action; Processing Queue retry is wired and demo-browser verified; Download Manager retry/cancel remain unwired. Rendering a control isn't completion.
- Add meaningful regression tests for state transitions, failure recovery, transcript integrity and isolation when those behaviors change. Don't add implementation-mirroring tests for documentation/cosmetic changes.
- No Workspace/Organization isolation exists. Before multi-user features, design additive ownership/membership migrations and scoped authorization/query/job/cache behavior. User model presence isn't authentication.
- Make incremental, reviewable changes; update these docs when facts change. Report what changed, why, checks run and limits. Do not rebuild or begin a major refactor solely because this audit identified debt.

## Founder consultation and continuity

Follow docs/FOUNDER_PROTOCOL.md. Keep EXECUTION_LOG, DECISION_LOG, CURRENT_STATE and ROADMAP current. Use the founder-review template only for genuine architecture/product/financial/security decisions or defined major product checkpoints. Routine debugging, tests and small existing-architecture fixes proceed independently. Do not claim background execution or production checkpoint completion from fixture tests.
