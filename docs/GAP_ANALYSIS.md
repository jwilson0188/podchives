# Podchives gap analysis

Baseline `cf83fa6`, audited 2026-10-09; updated through autonomous M3 downstream publication fixes (2026-10-10). Severity reflects impact on an accurate searchable archive and production operation. **Reproduced** audit findings use offline fixtures unless explicitly marked real PostgreSQL evidence; **code-confirmed** means inspection; **unverified** means a live check is required. No production state was changed.

## Immediate blockers and high-priority risks

### Milestone 1 addressed — Unsafe transcript replacement and stale readiness

`saveTranscriptSegments` now delegates to `lib/transcriptIntegrity.ts`. It validates the full input/episode before writes, rechecks under an Episode row lock, and transacts replacement, metadata, old downstream-job supersession, successor enqueue and current-job completion. Required attribution must match Episode; timestamps are finite/nonnegative with end > start and nondecreasing starts. Known duration tolerance is two seconds; null duration is unbounded. Input dialogue is preserved verbatim without deduplication. Failed writes preserve the previous text/vectors/readiness; provider work remains outside the transaction.

Successful writes mark embeddings/search pending and create a fresh downstream job. Segment ID snapshots guard transcription/segmentation and embedding publication; indexing checks job supersession and full current vector coverage. Semantic SQL excludes pending embeddings even for `searchable=0`. Search view no longer reuses historical memory/session hits. Stored valid text survives embedding failure. Existing FTS/vector indexes are maintained by PostgreSQL with row changes; deployed index installation is still unknown.

**Verified in Milestone 1B:** 47 unit cases and 12 real PostgreSQL cases pass with zero skips on PostgreSQL 17.11/pgvector 0.8.7. Old IDs/text/vectors/metadata/jobs survive both injected callback failures and a real foreign-key violation after deletion. Two independent sessions were observed waiting on the Episode lock, then exactly one committed the shared generation. Successful metadata/jobs, FTS/readiness transitions and rejected stale transcription/embedding/indexing completions pass. Concurrent old failure preserves new queued work. The disposable runner confirms fixture cleanup and removes its cluster. No application fix or migration was needed.

**Still unverified/outside this proof:** deployed pooler/worker and browser freshness, network/host crash recovery, provider failures, tenant isolation and historical data drift. There is no durable transcript version/provider history or worker lease; general queue races and legacy recovery/regeneration scripts remain. Already displayed search responses remain retrieval snapshots, without cross-client live invalidation.

### Milestone 2 addressed — Transcript HTML rendering

The shared highlight helper now produces React text and controlled mark nodes. SearchResultCard, TranscriptViewer and ClipOfTheWeek render children, eliminating all three transcript HTML sinks. Literal/case-insensitive matches and the existing visual class are preserved. Eight server-rendered markup regressions pass, including empty-query markup, malicious matched queries and entity-encoded captions. Browser end-to-end interaction remains unverified; this change does not constitute a broader URL/player security audit.

### P0 for multi-user release — No tenant isolation or real user authorization

`User` has no relationship to Podcast/Source/Episode. No Workspace/Organization/Membership exists. API paths trust IDs and query globally. The shared beta gate defaults to open when `BETA_PASSWORD` is absent and supplies no actor/tenant identity. No repository RLS policies exist; deployed DB policies are unknown.

Cookie derivation and password rotation passed offline checks. The cookie is a deterministic password-derived bearer token, not an individually expiring session with server revocation. Login has a delay but no rate limiter. Middleware is the sole access boundary; current dependency security advisories were not checked. Do not interpret this beta model as a multi-user authorization system.

### M3 handoffs and admission addressed; P1 attempt ownership remains

Milestone 1 completes transcription/segmentation and creates their successor inside the transcript transaction. M3 now transacts embedding readiness + indexing enqueue + job completion, and search readiness + indexing completion. Same-generation finishers reuse one successor; late completed-job failure cannot cancel it. Real rollback/concurrency evidence is in CURRENT_STATE. The subsequent media increment now transacts thumbnail/download/audio-extract completion and successor admission. Maintenance enqueue shares the Episode lock. Artifact persistence remains outside handoff transactions; durable ownership/reclaim remain incomplete. Initial episode admission now serializes Source → Episode locks and checks source pressure transactionally. `enqueueNextPipelineJob` lookup/create now serializes under the Episode lock, including against worker completion. Audio-fallback/source-sync admission still have separate checks/insertion; low-level createProcessingJob can bypass episode admission. Source creation separates Source creation from discovery enqueue; manual sync always creates a job.

**Historical reproduction fixed:** successor-create failure previously left a completed predecessor. Real PostgreSQL media tests now prove rollback at successor creation and predecessor completion, plus two-session contention and idempotent completion. Initial episode admission/resume is now covered by additional PostgreSQL contention and preservation tests. Source-sync/audio-fallback admission is now serialized (see current continuation below). General attempt ownership and all-provider exactly-once execution remain unresolved.

### M3 admission resume addressed; remaining artifact/retry risks

Initial admission no longer stops merely because audioFilePath is populated. The planner uses transcript rows, segmentation evidence, vector/readiness state, and readable nonempty local files. Missing media can queue recovery; valid caption-only transcripts resume downstream without audio. Source caps and episode dedup share Source → Episode locks; extraction counts as active pressure. Tests verify text/vector/metadata preservation and real worker claim eligibility for segmentation with an inconsistent flag.

Remaining: files may disappear after admission or be unavailable on another worker. Regular-file checks do not validate codecs or media completeness. Already queued media jobs still use path-based SQL eligibility; worker fallback needs hardening for stale paths. `scripts/recover-queue.ts --reset` remains unsafe for valid caption/feed transcripts and was not run or changed. Source-sync/audio-fallback admission and comprehensive cancellation/leases remain open.

### Milestone 2 addressed — Destructive caption deduplication; ambiguous copies remain

The old global 60-word comparison removed genuine repeated dialogue and stretched a 0–1s cue across a repeated 100–101s cue. M2 removes that heuristic. Long-gap, adjacent and overlapping untimed speech now survive with their original ranges. Explicit inline timestamps produce bounded spans; invalid ranges/order reject parsing. Numeric dialogue, fractional timing and one-pass Unicode entity decoding have focused coverage.

YouTube-only deduplication requires identical explicit start/end/text within overlapping cue windows; feed VTT preserves all cues. **Remaining limitation:** untimed rolling prefixes/hold cues and replicas with changed timing are retained, so some captions can still contain duplicate text. Live YouTube format coverage remains unverified. This intentionally favors preserving evidence over guessing which repeated words to delete. Stored transcripts were not backfilled, and raw-cue/version storage remains missing.

Twenty-five parser fixtures and eight rendering fixtures pass alongside all original integrity tests. No schema migration is required. The existing cheap-transcript failure/fallback behavior is unchanged; no provider call was made to test fallback.

### P1 — Worker pause, stop, reclaim, retry semantics are incomplete

- Global pause is now checked in every claim statement; already claimed work continues. SIGTERM still changes the outer-loop flag, not the inner drain loop. Auto-sync/reclaim checks also wait until a batch returns.
- `stopSourceSync` now marks running and queued jobs stopped and serializes with worker publication. External operations are not terminated; durable attempt ownership remains absent.
- Overnight retry now excludes stopped/cancelled/superseded jobs. It can queue ordinary failures during pause, but claim SQL blocks execution. Continuous runner does not do this retry sweep.
- Stale reclaim uses `updatedAt` without a heartbeat or ownership token; raw SQL claim now refreshes `updated_at`, but subsequent long operations can still age out. Long-running API/subprocess work can be reclaimed while alive. Reclaim does not increment retryCount or enforce an attempt limit.
- Mark completed does not clear errorMessage; a reclaimed job can remain completed with `Requeued after stale timeout`. Successor lookup requires completed + null error, allowing inconsistent dedup behavior.
- Manual retry can requeue a running/completed job by ID, not just failed jobs; no limit/backoff/classification. Failure state is mostly job-local; episode status/flags are not consistently updated, so failed episode filters can miss failures.

These are code-confirmed control-flow risks; live concurrent-claim and crash/retry experiments remain required. Introduce explicit cancelled state, per-claim pause/cancel checks, heartbeats/leases, and bounded retries incrementally.

### P1 — Errors look like empty archives or successful demo operations

`useDemoData` falls back when DATABASE_URL is absent. Multiple data functions swallow errors into zeros/empty arrays/null. Search similarly returns no matches after provider/DB failures; `/api/search` does not communicate degraded retrieval. Stashes can hide deleted or unavailable data. Top-nav badge only knows the demo flag.

Make demo mode explicit and preserve it as a useful fixture mode. Return an error/degraded state for failed real requests, with last-known-good freshness if available. Keep zero results distinct from an unavailable database/provider. The recent search fetch-loop fix is present; don't regress its stable effect dependencies.

### P1 — Intake validation allows unsupported/network-sensitive URLs

Zod checks generic URL syntax; `detectYouTubeSourceType` never requires a YouTube hostname and defaults to a channel. URL type override is also accepted without checking consistency. RSS detection is a substring heuristic. yt-dlp supports more than YouTube, and RSS/feed/enclosure/transcript fetches have no restricted destination or redirect policy, response size ceiling, or timeout.

**Reproduced:** non-YouTube HTTPS host classified as a channel and acknowledged by source POST in demo mode. Risk: unexpected extractors, server-side network access, runaway downloads. Validate platform host/scheme/resource IDs and fetched/redirected destinations before public ingestion; preserve an explicit generic RSS intake path for valid feeds.

## Data integrity capability matrix

| Requirement | Current support | Gap / proposed direction |
| --- | --- | --- |
| Multiple podcasts | Present | Podcast table + filters. Global slug derived from generic name can merge unrelated individual-video sources into `youtube-source`. |
| Multiple workspaces | Missing | Add workspace/organization and memberships before shared access. |
| Multiple sources per podcast | Present in schema/API | Creation accepts podcastId; UI/provider branding isn't a canonical source-linking workflow; one source can overwrite shared Podcast branding. |
| Unique source identifiers | Missing | No stored canonical channel/playlist/feed ID, uniqueness, or URL normalization. |
| Episode dedup | Partial | Unique `(sourceId, externalId)` handles re-sync within one Source only. Same video across channel/playlist/direct Source duplicates; duplicate Source rows multiply episodes. |
| Episode provenance | Partial | Source FK, external ID, source platform/URL and metadata. No immutable discovery record/raw metadata/checksum; RSS pageUrl parsed but not persisted as a separate canonical episode page. |
| Transcript provenance | Partial | Per-segment source URL/platform/source type; RSS transcript URL on Episode. Groq and OpenAI both recorded as `whisper_api`; manual/local strings exist without workflows. |
| Transcript version/provider metadata | Missing | No version, provider/model/config/language/response, caption track type, content checksum or active-version pointer. Destructive replacements change segment IDs. |
| Accurate start/end | Partial | Milestone 1 validates ranges/order/duration in persistence; no DB checks. Caption dedup and nominal ffmpeg offset drift remain; word timings absent. |
| Source attribution | Present for search shape | Milestone 1 requires transcript podcast/platform/URL to match Episode. Independent FKs still lack cross-table constraints and immutable version citations. |
| Embedding storage | Present | Nullable pgvector(1536); writes require 1536 finite values and publication checks all current vectors. No model/version per vector; retries re-embed all segments. |
| Ranking | Implemented, unverified | FTS/cosine/RRF. Relative display scores are not probabilities. No relevance corpus, evaluation, similarity cutoff, or performance benchmark. |
| Processing retries/resumability | Partial | Atomic row claim, counters, manual retries, stale reclaim, fallback, scripts. Missing atomic transition, lease, checkpointed API batches and durable media. |
| Organization-level isolation | Missing in app/repo | No scoped ownership queries, job tenant context, analytics scoping or cache isolation. |
| Contextual moment detection | Timestamp/episode foundation only | No raw/versioned cues, speakers, neighbors, Moment/Claim/evidence schema, context retrieval job, or evaluation. |
| Referential consistency | Partial | Cascade FKs protect existence; no cross-table consistency constraint for podcast/source/episode/segment pairing. |
| Search readiness integrity | Bounded PostgreSQL integration verified | Atomic invalidation, complete coverage/current-generation publication and rejected stale completion pass in 1B. General queue handoff and live browser invalidation remain. |

All schema conclusions refer to `prisma/schema.prisma`; live schema drift and existing inconsistent data remain unverified. Do not fix these by destructive schema push or bulk reset.

## Other functional and technical gaps

| Priority | Finding | Evidence / impact |
| --- | --- | --- |
| P1 | Real pipeline acceptance and CI missing | Integrity unit and real Postgres suites pass. No full provider/worker/browser acceptance or CI workflow. |
| P1 | Missing migration/index rollout discipline | Ad hoc ALTER scripts and db push; no reviewed baseline migration or installed-index proof. Index script creates normal blocking indexes and a broad HNSW failure fallback; needs staging/review. |
| P1 | Keyword availability gated on OpenAI embeddings | Valid free captions cannot become default-searchable if embedding fails. Separate FTS and semantic readiness in a later reviewed change. |
| P1 | RSS download completion is unsafe | Writes ignore stream backpressure; `file.end()` isn't awaited before stat/return. Failed/partial files can be reused; enclosure always named mp3 regardless of actual media. |
| P1 | No enforced usage/cost ceiling | Continuous worker ignores MAX_JOBS_PER_RUN; computeLimit only shown in UI. Paid fallback, embeddings and semantic queries have no admission budget/rate limiter. |
| P2 | Episode catalog hides rows | Default take 200, no cursor; download manager uses 500 catalog/200 downloads; NULL publish dates sort first under DESC. Unknown dates formatted as epoch in parts of view mapping. |
| P2 | Discovery incomplete metadata and unbounded catalog listing | Flat listing may omit dates/duration; no per-video enrichment. Optional playlistEnd unused by worker; complete output buffered in RAM. |
| P2 | Sync history inaccurate | SourceSyncJob counters stay default zero; updateMany completes all running rows for the source rather than exact run ID. Duplicate syncs race. |
| P2 | Operational buttons unwired | Download Retry/Cancel/Sync all and Processing Retry job have no handler. Retry API exists but does not validate status. |
| P2 | Download Manager is not live | No polling for table; only SSR snapshots. Caption-only pipeline lacks download rows, so it is not a complete pipeline view. |
| P2 | Files and cached thumbnails | Worker paths not browser URLs; cached thumbnails not served, failed thumbnail fetch still stores target path. No retention, quotas or durable raw artifacts. |
| P2 | Playback integration unverified | YouTube postMessage ready/subscription/origin handling incomplete; RSS external only. Media no longer available on source cannot be played from local storage through web. |
| P2 | Misleading usage estimates | Current backend rate applied to all transcribed duration, including free captions; retry spend overwritten/unrecorded; query-embedding spend omitted; persisted audio bytes count historical downloads, not current disk occupancy. |
| P2 | Scheduler/settings mismatch | DB loader unused; separate runner ignores worker switch; concurrentWorkers setting unused by scheduler runOnce. Settings is read-only and reports web env values as worker hints. |
| P2 | Runtime/deploy reproducibility | Docker Node20 vs local22; latest yt-dlp/Deno downloads; no pinned container binaries, health endpoint, deployment runbook test or memory benchmark. Concurrency10 capacity is unverified. |
| P2 | Secret build-context hygiene | Ignore patterns differ for `.env.*.local`; review Docker COPY context. Existing cookie removal history warrants an authorized history scan/rotation assessment, not an assumption that secrets remain leaked. |
| P2 | Logging/observability | Console/error strings and WorkerRun logs; no structured correlation/alerts/traces. Run rows marked completed can include job failures. Paths/remote error strings can expose internal details. |
| P2 | Lint configuration missing | Temporary standard Next rules found 23 errors; ordinary `useDemoData` helper naming triggers hooks rule. Configure meaningful baseline after approval. |
| P3 | Large data module and duplicate logic | `lib/data.ts` ~1475 lines; duplicated branding, ingestion loop and cache predicates. Refactor only behind tests after correctness fixes. |

## Product features without a backend implementation

Patreon authorized access, uploaded-file ingestion, workspace accounts, subscriptions/billing, enforced usage budgets, speaker matching/diarization, contextual pivotal/funny/serious/viral discovery, contradiction analysis, durable saved clips, video clip editing, caption editor/export, media export and clip rendering are **missing**. Constants/disabled controls/specs do not implement them. Clip of the week is a query/latest-segment heuristic. Semantic search is already implemented in code despite older docs suggesting it is future work.

## Unresolved verification blockers

1. Disposable PostgreSQL/pgvector is now available through npm run test:postgres; the integrity suite has executed successfully. Deployed/staging schemas, indexes, tenant policies, row counts and pooler behavior remain unknown.
2. Reliable bounded YouTube caption/media access from intended worker network, with valid cookie configuration and no archive expansion.
3. Approved provider/cost allowance for a one-video fallback/embedding test; existing keys' validity wasn't tested.
4. Docker/container execution and actual Render/Vercel configuration/revision evidence.
5. A known public video and manual expected phrase/timestamp oracle for search/playback validation.

These blockers prevent certification; they do not justify rebuilding the application. Prioritize safe persistence, truthful state, recoverable work, and bounded integration evidence.

## M3 continuation — Source admission and worker claim controls (2026-10-10)

`lib/queueControl.ts` serializes source-sync admission under the Source lock, rechecks automatic eligibility, reuses active jobs and commits queued source metadata with the new job. Manual sync and source creation use that path. Source stop now cancels queued work and updates source metadata in one transaction under the same lock.

Audio fallback checks current job and segment IDs under the Episode lock, preserves existing transcript text, deduplicates downloads, and commits transcription failure before the download can be claimed. Repeated failure notification cannot cancel the recovery successor. The actual download/provider work remains outside these transactions.

Every SQL claim checks global pause and excludes stopped/cancelled/superseded markers; claims refresh updated_at. Missing settings still mean enabled; any paused settings row blocks claims. Worker status uses the same rule and a settings read error pauses the outer worker loop. The toggle updates existing settings rows together. Automatic retry excludes cancellation/supersession, but may still queue ordinary failures while paused; they cannot be claimed until resumed.

**Verification:** 127 unit + 58 real PostgreSQL cases = 186 including parent, zero failures/skips. Typecheck, Prisma validation, targeted lint and safe demo production build passed. Eleven new DB cases cover concurrent admission, failure rollback, transcript preservation, fallback recovery, stop rollback, pause/resume and retry exclusions. Initial test run failed two claim assertions due to source-job fixtures surviving source deletion (the schema uses SetNull); explicit fixture cleanup fixed this. Final runner confirmed zero fixture rows and removed the cluster. No migration, production data change, provider call or deployment.

**Limits:** pause is observed at each claim statement's snapshot; work already claimed can finish. Source stop does not interrupt external calls; the subsequent cancellation increment guards worker publication and successor creation. Durable attempt leases, same-job stale attempt ownership, settings-row uniqueness, manual retry validation and UI retry wiring remain outstanding. Tests exercise helpers and actual claim SQL, not browser or live connector end-to-end flows. Searchable Archive checkpoint remains incomplete.

## Running-job cancellation and explicit retries — 2026-10-10

Source stop now locks Source then its Episodes in ID order and marks both queued and running processing/download/sync records stopped in one transaction. Existing guarded transcript/media completion shares those Episode locks. Source workers guard catalog/branding writes, startup, exact sync-run completion/failure and episode admission with their current job ID under Source locks. Progress updates only accept active jobs. Dispatcher stale-generation handling no longer overwrites terminal cancellation state.

Media path/download-status publication and worker embedding-vector writes now use active-job guards under Episode locks. Embedding loops check activity before each provider batch. External network calls, subprocesses and filesystem writes are not interrupted; their outputs cannot be published by a stopped job through these worker paths. This is a database publication guarantee, not process termination or a guarantee of zero further provider spend.

Explicit retry validates existence/state (404/409 at the API), rejects competing active/newer work, and atomically retires the old identity with a superseded marker while creating a fresh queued job. Source retry updates queued metadata in that transaction. It never reactivates the old stopped worker's job ID. Repeated/concurrent requests yield one new job. Retrying an episode does not resume all other stopped source jobs or re-enable automatic sync.

Verification: **127 unit + 67 real PostgreSQL cases, 195 including parent, zero failures/skips**. Nine new DB cases cover running media/source/transcript stop guards, completion racing stop, fresh retry identity, invalid retry states, retry rollback, concurrent retries and source retry metadata rollback. Typecheck, dummy-URL Prisma validation, targeted lint, safe demo production build and diff whitespace checks pass. Disposable fixture cleanup/server shutdown verified. No migrations, paid jobs, production changes or deployment.

Remaining boundaries: no durable worker-attempt leases; automatic retries/stale reclaim still reuse job IDs, so ownership across those attempts remains unresolved. Low-level maintenance helpers can bypass worker guards. Already-running subprocesses can continue writing shared local paths; attempt-specific durable artifact storage remains unresolved. Browser retry action is still unwired, and live source/provider cancellation is unverified. Stop is not a permanent ban on deliberate later manual work. Next routine work is honest queue controls (retry wiring and stopped-state presentation); attempt ownership needs a concrete design before any broader refactor.

## Processing Queue retry controls — 2026-10-10

ProcessingJobRow now posts to the existing validated retry API. A synchronous pending guard and disabled button prevent duplicate clicks; successful real admission disables the old row and refreshes server data while existing four-second JSON polling continues. Errors remain visible, including 404/409, and malformed responses are not treated as success. Demo acknowledgements explicitly say no job was queued. Source-sync rows link to Sources instead of an empty episode URL.

Stopped, cancelled and superseded message markers map to neutral, non-pulsing badges and progress bars; they never display the successful ready badge. Only ordinary failed and user-stopped rows offer retry. Existing database buckets remain unchanged: section names now say Failed or stopped and Recently finished, avoiding misleading success claims without a schema change.

Verification: 10 new controls/transport regressions plus all previous suites pass: **137 unit + 67 PostgreSQL cases, 205 including parent, zero failures/skips**. Browser verification against a loopback-only demo server confirmed the click, disabled Queueing retry state, HTTP acknowledgement and visible Demo preview only — no job was queued message; no real job was enqueued. Screenshot: /private/tmp/podchives-retry-demo.png (temporary evidence). Real admission remains covered by disposable DB integration tests, not a browser-to-live-provider run. Prisma validation and targeted lint pass. Safe demo production build and the subsequent typecheck both pass. An intermediate typecheck overlapped Next dev regeneration and reported missing .next/types; final verification is serialized after stopping dev. No schema/dependency/provider/production changes.

Remaining: Download Manager retry/cancel buttons are still unwired; live DB error-to-empty fallback and stale poll feedback remain; no browser test of a real DB retry yet. Automatic retry/reclaim ownership remains unresolved. Next routine work: make queue loading failures visible without replacing a valid snapshot with an apparently empty queue.

## Queue read failures and snapshot recovery — 2026-10-10

Processing queue reads now carry an explicit unavailable marker on database errors. The live endpoint returns sanitized HTTP 503 JSON with Cache-Control: no-store, rather than HTTP 200 empty buckets. The queue page suppresses zero-count cards on initial queue failure and displays unavailable worker controls if that read fails.

The queue-specific useQueuePoll hook preserves its last successful snapshot when a poll or refreshed server read fails, displays a stale-state warning, and removes the warning after recovery. It does not change other useLivePoll consumers. Requests run serially, wait four seconds after completion, time out after 15 seconds, skip hidden tabs, and abort/ignore late results after cleanup or a new server snapshot. Successful initial empty queues remain valid empty queues; unavailable initial reads do not render empty-state success messages.

Verification: five new deterministic polling regressions cover recovery, preserved snapshots, no overlapping reads, timeout, hidden tabs and disposed requests. **142 unit + 67 PostgreSQL cases = 210 including parent; zero failures/skips.** Disposable cluster cleanup verified. Browser test against an intentionally unreachable dummy loopback DB showed queue/worker unavailability rather than zero jobs. Direct local HTTP check confirmed 503, no-store and the generic message. No live credentials, archive/provider work or production writes. Prisma validation and targeted new/changed queue-file lint pass. lib/data.ts still reports its 22 pre-existing useDemoData helper-name hook-rule errors; no project-wide clean lint claim. Safe demo production build and the subsequent TypeScript typecheck pass.

Limits: snapshot recovery is covered deterministically; a browser outage-to-real-DB-recovery sequence was not exercised. Dashboard/getAllProcessingJobs consumers still flatten unavailable bucket arrays and need separate degraded-state work. Worker controls require page refresh after their initial read fails. Existing queue summary cards are server snapshots. Automatic retry/reclaim ownership and Download Manager controls remain outstanding. No migration or dependency change.
