# Podchives current state

Audit date: **2026-10-09 (America/Chicago)**. Baseline: `codex-refactor`, commit `cf83fa6` (`Merge pull request #20 from jwilson0188/fix/search-fetch-loop`). Updated through autonomous M3 downstream and media handoff fixes (2026-10-10). Check Git for branch publication status; the application schema, .env and production data were not changed. Milestone 1B installed a native test database runtime and provisioned only disposable test clusters.

## Download Manager read reliability — 2026-10-11

The manager now loads a labelled snapshot through strict download/source/episode reads; any failed read produces explicit unavailability instead of an apparently empty archive. Its no-store live endpoint returns sanitized 503 errors. A serial client poll uses the established four-second interval-after-completion, 15-second timeout, visibility pause and cleanup guards, preserving the last successful snapshot during failures and server refresh errors. The snapshot refreshes download states, associated episode readiness, sources and displayed counts together. Other data-layer callers retain their existing fallback behavior.

Readiness queries now fetch the episodes actually referenced by displayed downloads, including older episodes outside the previous 500-episode listing. Summary labels explicitly describe displayed records, and the 200-download cap/caption-only exclusion are visible. Demo data is explicitly labelled. The inert Sync all sources button was replaced with Manage sources linking to existing per-source controls; no bulk ingestion was introduced.

Verification: six new snapshot tests cover referenced IDs, each read-failure stage, empty-vs-unavailable and demo labelling. **148 unit + 73 PostgreSQL cases = 222 including parent; zero failures/skips.** Fixture cleanup and cluster removal verified. Typecheck, safe demo production build, Prisma validation and targeted lint pass. lib/data.ts retains the existing 22 helper-name hook-rule errors, with no additional reports. Browser checks verified unavailable UI against a dummy unreachable database, demo labels/displayed counts and navigation to Sources. HTTP check confirmed sanitized 503 and no-store. Browser outage-to-real-DB recovery remains unverified; polling recovery has deterministic tests. No production data, paid jobs, migrations or deployments.

Download retry/stop controls and this reliability increment are prepared together for publication on codex-refactor after 60d0c1e. Remaining: exact download/job association, dashboard degraded-state handling, general attempt ownership/leases, and bounded real-video acceptance with an isolated target and approved provider budget. No live searchable-archive checkpoint has been claimed.

## Download Manager controls — 2026-10-11

Download Manager now exposes Retry download and Stop episode processing through explicit POST endpoints. Shared desktop/mobile action components show pending/error/success states, reject duplicate local clicks, refresh server data after real success, and distinguish demo acknowledgements from real mutations. Stopped download badges/progress use neutral presentation.

Download rows have no processing-job foreign key. Retry therefore fails closed unless one failed download job can be identified; its latest-download identity, status, timestamp ambiguity and candidate count are rechecked under the existing Source → Episode transaction before the validated fresh-ID retry. Historical/ambiguous rows return 409 and direct users to Processing Queue. No guessed nearest-timestamp association is used.

Stop is deliberately labelled at episode scope: under Source → Episode locks it stops queued/running episode jobs and active download records, retaining transcript/media database state and leaving other episodes unchanged. It rejects obsolete/completed rows. Repeated stop is idempotent only while no resumed active work exists. It does not terminate external subprocesses, change source auto-sync, or delete files/transcripts.

Verification: **142 unit + 73 real PostgreSQL cases = 216 including parent; zero failures/skips.** Six new DB cases cover unique/concurrent retry, missing/ambiguous mapping, historical rows, episode isolation/transcript preservation, rollback and stop-after-resume rejection. Fixture cleanup/server shutdown verified. Typecheck and targeted lint passed before browser testing; Prisma validation passed. Safe demo production build and the final TypeScript typecheck also passed. Browser verified Retry on the demo Download Manager and Stop using the same component on a temporary demo-only fixture page; both showed disabled pending state and no-real-mutation acknowledgement. Fixture page was removed before build. Demo screenshots are temporary local evidence at /private/tmp/podchives-download-retry.png and /private/tmp/podchives-download-stop.png. No migrations, provider jobs, production writes or deployment.

Remaining: no browser-to-real-DB control test; download history remains unlinked to exact job IDs, so ambiguous legacy histories need Processing Queue. Download Manager still lacks live polling, has error-to-empty read fallbacks and an unwired Sync all sources button. Implemented after pushed commit 60d0c1e; production deployment remains unverified. Next routine work: honest Download Manager read failures and status refresh, before broader sync controls.

## Queue read failures and snapshot recovery — 2026-10-10

Processing queue reads now carry an explicit unavailable marker on database errors. The live endpoint returns sanitized HTTP 503 JSON with Cache-Control: no-store, rather than HTTP 200 empty buckets. The queue page suppresses zero-count cards on initial queue failure and displays unavailable worker controls if that read fails.

The queue-specific useQueuePoll hook preserves its last successful snapshot when a poll or refreshed server read fails, displays a stale-state warning, and removes the warning after recovery. It does not change other useLivePoll consumers. Requests run serially, wait four seconds after completion, time out after 15 seconds, skip hidden tabs, and abort/ignore late results after cleanup or a new server snapshot. Successful initial empty queues remain valid empty queues; unavailable initial reads do not render empty-state success messages.

Verification: five new deterministic polling regressions cover recovery, preserved snapshots, no overlapping reads, timeout, hidden tabs and disposed requests. **142 unit + 67 PostgreSQL cases = 210 including parent; zero failures/skips.** Disposable cluster cleanup verified. Browser test against an intentionally unreachable dummy loopback DB showed queue/worker unavailability rather than zero jobs. Direct local HTTP check confirmed 503, no-store and the generic message. No live credentials, archive/provider work or production writes. Prisma validation and targeted new/changed queue-file lint pass. lib/data.ts still reports its 22 pre-existing useDemoData helper-name hook-rule errors; no project-wide clean lint claim. Safe demo production build and the subsequent TypeScript typecheck pass.

Limits: snapshot recovery is covered deterministically; a browser outage-to-real-DB-recovery sequence was not exercised. Dashboard/getAllProcessingJobs consumers still flatten unavailable bucket arrays and need separate degraded-state work. Worker controls require page refresh after their initial read fails. Existing queue summary cards are server snapshots. Automatic retry/reclaim ownership and Download Manager controls remain outstanding. No migration or dependency change.

## Processing Queue retry controls — 2026-10-10

ProcessingJobRow now posts to the existing validated retry API. A synchronous pending guard and disabled button prevent duplicate clicks; successful real admission disables the old row and refreshes server data while existing four-second JSON polling continues. Errors remain visible, including 404/409, and malformed responses are not treated as success. Demo acknowledgements explicitly say no job was queued. Source-sync rows link to Sources instead of an empty episode URL.

Stopped, cancelled and superseded message markers map to neutral, non-pulsing badges and progress bars; they never display the successful ready badge. Only ordinary failed and user-stopped rows offer retry. Existing database buckets remain unchanged: section names now say Failed or stopped and Recently finished, avoiding misleading success claims without a schema change.

Verification: 10 new controls/transport regressions plus all previous suites pass: **137 unit + 67 PostgreSQL cases, 205 including parent, zero failures/skips**. Browser verification against a loopback-only demo server confirmed the click, disabled Queueing retry state, HTTP acknowledgement and visible Demo preview only — no job was queued message; no real job was enqueued. Screenshot: /private/tmp/podchives-retry-demo.png (temporary evidence). Real admission remains covered by disposable DB integration tests, not a browser-to-live-provider run. Prisma validation and targeted lint pass. Safe demo production build and the subsequent typecheck both pass. An intermediate typecheck overlapped Next dev regeneration and reported missing .next/types; final verification is serialized after stopping dev. No schema/dependency/provider/production changes.

Remaining: Download Manager retry/cancel buttons are still unwired; live DB error-to-empty fallback and stale poll feedback remain; no browser test of a real DB retry yet. Automatic retry/reclaim ownership remains unresolved. Next routine work: make queue loading failures visible without replacing a valid snapshot with an apparently empty queue.

## Running-job cancellation and explicit retries — 2026-10-10

Source stop now locks Source then its Episodes in ID order and marks both queued and running processing/download/sync records stopped in one transaction. Existing guarded transcript/media completion shares those Episode locks. Source workers guard catalog/branding writes, startup, exact sync-run completion/failure and episode admission with their current job ID under Source locks. Progress updates only accept active jobs. Dispatcher stale-generation handling no longer overwrites terminal cancellation state.

Media path/download-status publication and worker embedding-vector writes now use active-job guards under Episode locks. Embedding loops check activity before each provider batch. External network calls, subprocesses and filesystem writes are not interrupted; their outputs cannot be published by a stopped job through these worker paths. This is a database publication guarantee, not process termination or a guarantee of zero further provider spend.

Explicit retry validates existence/state (404/409 at the API), rejects competing active/newer work, and atomically retires the old identity with a superseded marker while creating a fresh queued job. Source retry updates queued metadata in that transaction. It never reactivates the old stopped worker's job ID. Repeated/concurrent requests yield one new job. Retrying an episode does not resume all other stopped source jobs or re-enable automatic sync.

Verification: **127 unit + 67 real PostgreSQL cases, 195 including parent, zero failures/skips**. Nine new DB cases cover running media/source/transcript stop guards, completion racing stop, fresh retry identity, invalid retry states, retry rollback, concurrent retries and source retry metadata rollback. Typecheck, dummy-URL Prisma validation, targeted lint, safe demo production build and diff whitespace checks pass. Disposable fixture cleanup/server shutdown verified. No migrations, paid jobs, production changes or deployment.

Remaining boundaries: no durable worker-attempt leases; automatic retries/stale reclaim still reuse job IDs, so ownership across those attempts remains unresolved. Low-level maintenance helpers can bypass worker guards. Already-running subprocesses can continue writing shared local paths; attempt-specific durable artifact storage remains unresolved. Browser retry action is still unwired, and live source/provider cancellation is unverified. Stop is not a permanent ban on deliberate later manual work. Next routine work is honest queue controls (retry wiring and stopped-state presentation); attempt ownership needs a concrete design before any broader refactor.

## M3 continuation — Source admission and worker claim controls (2026-10-10)

`lib/queueControl.ts` serializes source-sync admission under the Source lock, rechecks automatic eligibility, reuses active jobs and commits queued source metadata with the new job. Manual sync and source creation use that path. Source stop now cancels queued work and updates source metadata in one transaction under the same lock.

Audio fallback checks current job and segment IDs under the Episode lock, preserves existing transcript text, deduplicates downloads, and commits transcription failure before the download can be claimed. Repeated failure notification cannot cancel the recovery successor. The actual download/provider work remains outside these transactions.

Every SQL claim checks global pause and excludes stopped/cancelled/superseded markers; claims refresh updated_at. Missing settings still mean enabled; any paused settings row blocks claims. Worker status uses the same rule and a settings read error pauses the outer worker loop. The toggle updates existing settings rows together. Automatic retry excludes cancellation/supersession, but may still queue ordinary failures while paused; they cannot be claimed until resumed.

**Verification:** 127 unit + 58 real PostgreSQL cases = 186 including parent, zero failures/skips. Typecheck, Prisma validation, targeted lint and safe demo production build passed. Eleven new DB cases cover concurrent admission, failure rollback, transcript preservation, fallback recovery, stop rollback, pause/resume and retry exclusions. Initial test run failed two claim assertions due to source-job fixtures surviving source deletion (the schema uses SetNull); explicit fixture cleanup fixed this. Final runner confirmed zero fixture rows and removed the cluster. No migration, production data change, provider call or deployment.

**Limits:** pause is observed at each claim statement's snapshot; work already claimed can finish. Source stop does not interrupt external calls; the subsequent cancellation increment guards worker publication and successor creation. Durable attempt leases, same-job stale attempt ownership, settings-row uniqueness, manual retry validation and UI retry wiring remain outstanding. Tests exercise helpers and actual claim SQL, not browser or live connector end-to-end flows. Searchable Archive checkpoint remains incomplete.

## M3 continuation — Initial episode admission and resume

Both episode-admission entry points now share Source → Episode transactional locks in `lib/queueAdmission.ts`. Source pressure is counted under the source lock; active episode work, including extraction, blocks duplicates. Existing failed user-stop markers prevent automatic readmission. Ready episodes are skipped based on transcript/vector/readiness evidence, not audio-path presence alone.

Resume selects segmentation for unfinished/unverified stored text, embedding for missing readiness/coverage, indexing for embedded pending search, or transcription/extraction from a readable nonempty regular local file. Caption-only stored transcripts are preserved without media checks. Missing files allow caption/feed recovery or download; no rows, flags or paths are reset. Segmentation eligibility now uses transcript-row existence, verified with the actual worker claim query against PostgreSQL.

**Admission-slice verification:** 127 unit + 47 real PostgreSQL cases (175 including parent), zero failures/skips. Added 10 unit/11 database cases, including two-session source-lock contention, one-slot source admission, rollback and preserved transcript state. Typecheck/schema validation/targeted lint pass; build evidence is in EXECUTION_LOG. No migrations or production/provider operations.

**Boundaries (updated by the control continuation):** source-sync/audio-fallback and per-claim pause are now covered. Raw episode admission, durable attempts/leases and cross-host artifact persistence remain unresolved. File checks do not prove codec validity or guarantee a file remains available after admission. M3 is incomplete.

## M3 continuation — Media-stage handoffs

`lib/queueTransitions.ts` now atomically completes thumbnail/download/audio-extract jobs with their next-step admission. The existing queue API delegates to it; maintenance successor enqueue shares the Episode lock. Successful repeats are no-ops, diagnostics are cleared on success, attribution/type are checked, and inactive jobs cannot publish. Generic media completion cannot bypass transcript-generation guards. Media failure and queued downstream cancellation also transact together, preserving committed same-job success against late failure.

Current verification totals: **117 unit + 36 PostgreSQL cases, 154 including the parent, zero failures/skips**. Added 20 unit/13 database cases cover source/audio bypasses, all three media stages, rollback at both handoff writes, repeated completion, late same-job failure, and two-session contention for same/different-job completion and maintenance enqueue. Typecheck and targeted lint pass; schema is unchanged and validation passed. Fixture rows/cluster cleanup and the final isolated demo production build passed. See EXECUTION_LOG.

No migration or production backfill. Initial episode admission and resume were addressed in the subsequent increment above; source-sync/audio-fallback admission were addressed by the control continuation. Artifact writes and provider work are outside these transactions, and there are no durable attempt leases or comprehensive cancellation semantics. Cross-job failure/reclaim races remain possible beyond the bounded completion cases. M3 and the Searchable Archive checkpoint remain incomplete.

## Autonomous M3 work — Atomic embedding/indexing publication

The founder's 2026-10-10 [execution protocol](FOUNDER_PROTOCOL.md) authorizes routine engineering without per-fix approval. Approval boundaries, technical decisions and results are maintained in DECISION_LOG and EXECUTION_LOG. Major product checkpoints and financial/security/architecture decisions still require consultation.

Embedding workers now atomically publish embedding metadata, create/reuse one effective current indexing successor and complete their job under the existing Episode lock. Generation IDs and vector coverage are rechecked before writes. Repeated successful completion is a no-op. Two finishers sharing a generation serialize; both same-job and separate-job cases create exactly one indexing successor. Superseded jobs cannot complete with a newer generation's IDs. Indexing now publishes search readiness and job success in one transaction too. Dispatcher completion and final progress writes were removed for these stages.

Late failure of a successfully completed job cannot reverse its completion or cancel the successor. A separate duplicate embedding failure records that job's error without cancelling valid indexing work after another job published readiness. Reclaimed active indexing jobs with diagnostic messages are reused, while superseded/failed terminal jobs do not block fresh indexing.

**Verified:** 17 new unit + 11 new real PostgreSQL cases; total **97 unit + 23 database cases (121 including parent), zero failures/skips**. Real transaction failure snapshots preserve text/vectors/metadata/jobs. Both concurrent-finisher tests observed two independent sessions waiting on the Episode row lock. Tests include repeat completion, stale jobs, failure after success, reclaimed indexing and rollback of indexing publication. Typecheck, Prisma validation and targeted lint passed; see EXECUTION_LOG for final build result. Disposable fixture/cluster cleanup passed.

**Limits:** no migration or production-data change. Provider batches still run outside the transaction and retries may repeat paid work. Low-level metadata-only embedding completion remains available without a job ID; actual workers always supply it. Media handoffs were addressed in the subsequent increment above. Initial admission, attempt ownership/leases, pause/cancel and deployed provider/pooler behavior remain outside this fix. This is a bounded M3 increment, not completion of the Searchable Archive checkpoint.

## Milestone 2 — Safe highlighting and conservative caption deduplication

Implemented and verified locally **2026-10-10**. The shared `highlight` helper returns React text/mark nodes. Search results, episode transcripts, and the dashboard featured clip all render these as children; none passes transcript text to `dangerouslySetInnerHTML`. Literal query matching remains case-insensitive, with the existing highlight class and layout. Rendered-markup tests cover malicious input, empty queries, query metacharacters, literal entities, and encoded markup arriving through caption parsing.

`parseWebVtt` no longer compares a global word history or extends an earlier cue over repeated dialogue. It validates cue and inline timing, retains fractional boundaries, preserves numeric dialogue, decodes entities once (including Unicode code points), and sorts interleaved inline spans from ordered overlapping cues. YouTube opts into deduplication only for spans whose explicit inline start, end, and exact decoded text all match a span from an overlapping cue. Generic/feed VTT does not opt in. Long-gap, adjacent and untimed overlapping repetitions survive. Malformed timing rejects the parse before persistence.

**Deliberate limitation:** without matching explicit span timing, repeated text stays intact. Untimed rolling prefixes/hold cues and replicas with changed boundaries can still appear more than once. Text overlap alone cannot safely establish that two instances represent the same speech. Cues with timing tags inside words or before attached punctuation stay whole, preventing downstream packing from inventing spaces. No timestamps are inferred for missing word boundaries, and no raw-cue archive/version history was added. The change affects future parsing; previously stored transcripts were not reprocessed or repaired.

**Verification:** 33 new regressions (8 rendering, 25 caption parsing) plus the original 47 unit and 12 real PostgreSQL cases pass: **80 unit + 12 database cases, 93 including the integration parent, zero failures/skips** with `npm run test:postgres`. PostgreSQL 17.11/pgvector 0.8.7 rollback, concurrency, stale completion and readiness tests still pass. Fixture cleanup, server shutdown and temporary-cluster removal succeeded. Typecheck, Prisma validation, targeted temporary Next core-web-vitals lint and the safe demo production build pass. `npm test` alone passes all 80 unit cases and deliberately skips the integration parent without a disposable URL. Existing punycode and Edge static-generation warnings remain; project-wide lint configuration and its historical errors were not addressed.

**No migration, new dependency, production data mutation, provider job or deployment.** Live YouTube formats/network access, browser interaction and the deployed worker remain unverified. Tests verify React-generated markup, not browser end-to-end execution.

## Milestone 1B — Real PostgreSQL verification passed

Verified **2026-10-09, 23:40 America/Chicago** with PostgreSQL **17.11**, pgvector **0.8.7**, Prisma **5.22.0**, Node **22.13.0**. Docker, PostgreSQL and an explicit test URL were initially absent. PostgreSQL/pgvector were installed through Homebrew, including dependencies. Homebrew also initialized its previously absent default cluster; that cluster was never started or used. No existing database was used.

`npm run test:postgres` creates a new temporary data directory, random SCRAM password and unused loopback port, initializes the current Prisma schema plus GIN FTS/HNSW vector indexes, and runs both suites. The runner constructs its own database URL, overrides ambient database settings, copies only the schema outside the repository for CLI provisioning, and verifies the connected server's data directory. It does not consume the application's .env or any supplied database URL as its test target.

**47 unit cases and 12 PostgreSQL cases passed, zero skipped/failed** (Node reports 60 including the containing integration test). The original nine integration cases passed before the suite was expanded. Real database evidence now covers:

- Complete rollback of old segment IDs/text/vector values, episode metadata and job rows after failures at insertion, metadata, invalidation, successor creation and job completion.
- An actual PostgreSQL foreign-key violation after deletion (Prisma P2003), with full restoration of the pre-operation snapshot.
- Successful transcript/metadata/job publication; old FTS text disappears, new text is present, vectors/search readiness reset together, and complete embedding/indexing publishes readiness correctly.
- Two independent PostgreSQL worker sessions explicitly observed waiting on a held Episode lock; after release, exactly one commits and the other receives TranscriptChangedError. Only the winner's complete text and one successor remain.
- Rejected stale transcription, embedding and indexing completion after a newer generation; old failures cannot cancel its fresh jobs, including concurrent failure/replacement.

The runner verified **zero fixture rows remaining**, stopped PostgreSQL and removed each temporary cluster. No production/existing user data, hosted providers or workers were used. Typecheck, Prisma validation, targeted lint and the demo production build pass. **No application defect was exposed and no application behavior or migration was changed in 1B.** Remaining limits: deployed Supabase/pooler and Render workers, real provider/YouTube access, browser behavior and the complete media acceptance flow are still unverified.

## Milestone 1 — Transcript data integrity

Implemented in `lib/transcriptIntegrity.ts`, used by the existing transcription and segmentation workers and convenience API. The whole dataset is copied and validated before writes: episode existence, matching podcast/platform/source URL, required fields/source type, nonblank text, finite nonnegative ordered timestamps with end > start, and nullable confidence within [0,1]. Ordering means nondecreasing starts; overlapping/nested cues and repeated dialogue are allowed. Known duration permits **at most two seconds** overshoot to accommodate rounded discovery durations; null duration has no upper bound, while zero/negative duration is rejected. Input is rejected, not silently sorted, truncated or deduplicated. Packing now retains the maximum end of overlapping cues.

One Prisma interactive transaction locks the Episode row, rechecks attribution/duration and the original segment ID set, replaces only that episode's text/vectors, updates transcript/readiness metadata, supersedes old downstream jobs, creates the successor and completes the current transcription/segmentation job. Any callback/commit failure rolls back those changes together. Existing append callers receive the same validation and atomic metadata/job handling. Provider/network work stays outside the transaction; transcription/segmentation capture segment IDs before it so an older operation cannot overwrite a newer commit.

Successful replacement sets `isTranscribed=true`, `transcriptStatus=completed`, `isEmbedded=false`, `embeddingStatus=queued`, `isSearchable=false`, `processingStatus=queued`. New segment vectors are null; previous token usage is retained until a successful embedding run records usage. PostgreSQL maintains existing FTS expression indexes transactionally, without an index rebuild. Default search hides pending episodes; semantic retrieval additionally requires complete embedding status even when `searchable=0`. Embedding publication checks current segment IDs and full vector coverage under the same episode lock. Indexing checks current job status/error and full coverage before publishing searchability. All older transcript jobs, including transcription, are superseded. Failure/cancellation takes the same Episode lock and rechecks supersession, so an old failure cannot cancel the new generation's queue; its worker returns skipped.

SearchResultsView clears earlier hits on a new request and no longer restores memory/session search snapshots; requests use no-store. There is no live push to invalidate an already displayed response when another process replaces its transcript. Results remain a snapshot of retrieval time. Keyword readiness still depends on embeddings; a failed embedding job keeps valid replacement text stored and pending, with retry available through the existing API. No transcript version history was added.

**Verification:** the initial Milestone 1 run passed 47 unit cases and skipped PostgreSQL. Milestone 1B above now proves the bounded rollback, locking, metadata and search/readiness behavior on a real isolated database. Deployed pooler/worker and browser behavior remain unverified. **No database migration is required.**

## Verdict and evidence boundary

Podchives is an existing single-user beta with a substantial implementation of YouTube/RSS ingestion, caption/API transcription, timestamped transcripts, embeddings, and search. It is **not yet verified as a production-ready end-to-end archive**. Transcript integrity now passes real isolated PostgreSQL integration checks. External providers, YouTube access and deployed services remain unverified; the earlier deployed-DB read-only check could not connect. Schema/index creation in 1B was restricted to new temporary test databases. No hosted transcription, archive download, queue drain or deployment was run.

Milestone 1 addresses unsafe transcript writes and their downstream readiness. Milestone 2 fixes unsafe transcript HTML rendering and destructive text-only caption deduplication. Remaining failures include racing initial source/episode admission, incomplete resume/attempt ownership and UI controls that have no handler; ambiguous rolling captions may retain duplicates under the conservative policy above. A successful build does not establish live pipeline correctness.

Read this with [ARCHITECTURE.md](ARCHITECTURE.md), [GAP_ANALYSIS.md](GAP_ANALYSIS.md), [ROADMAP.md](ROADMAP.md), and [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md).

## Repository inventory

- Working tree was clean at audit start. Milestone 1 adds functional changes, tests and updated handoff docs.
- `HEAD` equals the locally stored `origin/main` ref (0 ahead / 0 behind). No fetch was performed; this does not establish the current remote or deployed revision.
- Local branches: `audit-cleanup`, `codex-refactor` (active), `feat/rss-feed-transcripts`, `feat/rss-nightcap`, `feature/cheap-transcription`, `feature/dashboard-hero-redesign`, `feature/worker-controls`, `fix/archive-channel-thumbnail`, `fix/pipeline-chain-and-download-progress`, `fix/render-worker-docker-build`, `fix/transcription-pipeline-stall`, `main`.
- Remote tracking branches also include caption duplication, cookie diagnostics, queue/backpressure, search indexes, relevance, fetch-loop, and UI work.
- Recent history: `cf83fa6`/`4f6c05c` search fetch-loop fix; `06bc77a`/`0e2fee5` relevance display; `1f08f55`/`820d6c3` rolling caption deduplication; `aec390d`/`2a55eb0` search indexes and Advanced Search merge; `1c74db4`/`53954b4` cookie diagnostics; `a77c9fe`/`4ada595` worker concurrency.
- 171 tracked files at the baseline. Milestone 1 adds a focused automated test suite and npm test command; tracked migration history, CI workflow and ESLint configuration remain absent. `scripts/test-transcribe.ts` is a paid API diagnostic.
- Existing docs inspected: `README.md`, `AUDIT.md`, `GO_LIVE.md`, `DEPLOY.md`, `RESUME_TOMORROW.md`. They contain historical assertions rather than current verification evidence. In particular, the caption claim deadlock and missing audio fallback described in `AUDIT.md` now have implementations in `lib/queue.ts` and `workers/transcriptionWorker.ts`; they should not be presented as still wholly missing. Full operational behavior remains unverified.
- `.env` exists and is untracked/ignored; only variable names and whether values were present were inspected for reporting. No secret values were printed. `.cursor/mcp.json` is a Cursor Render integration, not application infrastructure code.

## Actual stack

Installed top-level versions match `package-lock.json`; no reinstall was necessary.

| Area | Actual implementation / locked version |
| --- | --- |
| Web and API | Next.js **14.2.35**, App Router; React/React DOM **18.3.1** |
| Language | TypeScript **5.9.3**, strict mode; `tsx` **4.22.4** for worker/scripts |
| Styling | Tailwind CSS **3.4.19**, PostCSS **8.5.15**, Autoprefixer **10.5.0**, clsx **2.1.1**, tailwind-merge **2.6.1** |
| Persistence | Prisma / `@prisma/client` **5.22.0**; PostgreSQL and `vector(1536)` via pgvector/raw SQL |
| Providers | OpenAI SDK **4.104.0**; Groq through the SDK's OpenAI-compatible endpoint |
| Validation | Zod **3.25.76** |
| Tooling | ESLint **8.57.1**, eslint-config-next **14.2.35**; no committed lint config |
| Auth | Custom shared `BETA_PASSWORD` cookie gate; no implemented identity provider |
| Jobs | PostgreSQL `processing_jobs` with `FOR UPDATE SKIP LOCKED`; no Redis/BullMQ |
| Media | System yt-dlp, ffmpeg, ffprobe; Deno available locally and installed in Docker |
| Storage | Worker-local filesystem; S3/Supabase Storage only a TODO |
| Deployment intent | Vercel web + Render Docker worker + shared Supabase Postgres, as described in repo docs |

Local runtime: Node **22.13.0**, npm **10.9.2**. Local binaries: yt-dlp **2026.03.17**, ffmpeg/ffprobe **8.0.1**, Deno **2.8.2**. Docker and PostgreSQL were absent at the initial audit; 1B installed PostgreSQL17/pgvector and used binaries from /opt/homebrew/opt/postgresql@17/bin. Docker remains unavailable. The Dockerfile uses `node:20-slim`; equivalent container execution was not tested. Manifest ranges differ from some installed versions (for example `next ^14.2.18`, `typescript ^5.6.3`); use the lockfile for reproducibility. Dependency vulnerability status was not established by this audit.

## End-to-end pipeline status

Definitions: **Implemented and verified** means the stated bounded behavior was exercised; **Implemented but unverified** means a real code path exists without runtime integration proof; **Partially implemented** means meaningful behavior is absent/incomplete; **Mock/demo only** means fixtures or acknowledgments; **Missing** means no implementation; **Broken** means a specific failure was reproduced or is explicit in the code. Offline mock-DB probes establish control flow, not real PostgreSQL transaction or queue behavior.

| Stage | Real-path status | Evidence and limits |
| --- | --- | --- |
| Source URL intake | Implemented but unverified | `/api/sources` validates JSON with Zod, creates Podcast/Source, enqueues discovery. Demo handler accepts sources without persistence; exercised offline. Real inserts not run. |
| Source validation | Partially implemented | URL syntax checked; platform/host/scheme/resource validity not checked. `https://example.invalid/private` is accepted and classified as a YouTube channel in an offline probe. |
| Episode discovery | Implemented but unverified | yt-dlp channel/playlist flat listing or single-video metadata; RSS fetch/pagination. External access and completeness not tested. Worker does not supply the optional YouTube listing bound. |
| Episode catalog | Partially implemented | Episode upsert on `(sourceId, externalId)` and real queries exist; catalog defaults to 200 with no API/UI pagination. Single-video discovery is a separate path. Flat listings are not individually enriched despite the docstring. |
| Media/caption access | Implemented but unverified | Caption-first bypasses audio; yt-dlp audio download, ffmpeg extraction, RSS enclosures, and RSS transcripts exist. Cookie config mismatch locally; no live fetch. |
| Transcription | Implemented but unverified | English YouTube captions → Groq fallback, optional direct Groq/OpenAI; failure without audio queues download. No hosted transcription was run. Caption validation/deduplication and rendering verified with deterministic fixtures; live formats remain unverified. |
| Timestamped segments | Partially implemented | Persistence validates ranges/order/duration and preserves supplied repetition; packing preserves overlapping end boundaries. M2 preserves repetition and explicit inline timing; ambiguous rolling copies remain. Durable raw cues, word-timing history and speakers are absent. |
| Database persistence | Implemented and verified for Milestone 1B cases | Real PostgreSQL rollback, metadata/jobs consistency, competing writers and stale completion pass. Deployed schema/pooler remains unverified. |
| Search indexing | Partially implemented; integrity verified locally | FTS visibility and vector/readiness transitions pass with real GIN/HNSW indexes and fixture vectors. Manual index setup remains; deployed indexes/provider embeddings unknown. |
| Search results | Implemented but unverified | SQL FTS, vector cosine, RRF hybrid and citations exist. Demo search API returned two `infrastructure` hits offline. Real results/ranking/performance untested; errors are converted to empty results. |
| Source playback | Implemented but unverified | YouTube iframe `start`, transcript `seekTo` postMessages, timestamped external links. URL generation verified offline; browser playback/seek handshake not exercised. RSS gets an external link, no audio player. |

The complete real URL → searchable quote → correct source playback acceptance test has **not passed in this audit**. No live database counts, throughput, coverage, provider access, or deployed health are asserted.

## What interfaces actually do

| Surface | Real backend path | Mock, incomplete, or misleading behavior |
| --- | --- | --- |
| Dashboard / Archives | Database counts, archive/source lists, recent episodes/searches | Demo fixtures by default. Dashboard stash has no expiry; errors can appear as zeros or retained stale data. |
| Sources | Create/delete source; enqueue sync; source/global auto-sync toggles; stop request | Demo writes acknowledge without persistence. Source creation and sync enqueue are not atomic. Manual sync has no duplicate guard. |
| Episodes/detail | Database metadata, transcript retrieval, YouTube player/citation/share links | Catalog truncation; no RSS in-app player; no durable clip editing/export. |
| Search | Real keyword/semantic/hybrid handlers; archive/platform/date filters | Demo modes all use the same keyword fixture search and ignore real search filters/ranking. Advanced Search is a redirect to `/search`. |
| Download Manager | SSR queries downloads/episodes/sources; source controls are wired | **Retry**, **Cancel**, and **Sync all sources** buttons have no handler. Download table has no live polling. Caption-only episodes create no audio Download row and can be absent here. Counts use truncated lists. |
| Processing Queue | Live poll every 4s, separate active/queued/failed/completed buckets and DB totals; global worker control | **Retry job** now calls the validated API with pending/error/success feedback. Each claim now checks global pause; already claimed work continues. Cancelled downstream jobs appear completed. |
| Settings | Read-only env presence/configuration view | Hardcoded deployment/provider labels; web env values cannot establish actual worker config. `STORAGE_BUCKET` does not enable object storage. |
| Usage / Compute | Recorded audio bytes, latest embedding tokens, episode durations, worker run times | Cost estimates, not billing records. Caption minutes charged at current API rate in aggregate estimates; retry spend and query embeddings omitted. Credits are informational, not enforced. |
| Clip of the week | Top recent keyword-search hit or latest searchable segment | A heuristic presentation card, not contextual discovery, virality scoring, or a saved/exportable clip. |

`lib/data.ts` and many routes use demo data when demo mode is true **or `DATABASE_URL` is absent**. The top-nav badge checks only `IS_DEMO_MODE`, so missing DB configuration can display fixtures without the same badge. The continuous worker does not have a demo-mode safeguard; do not start it against a live DB merely because the web is in demo mode.

## Verification record

| Check | Result |
| --- | --- |
| `npm ls --depth=0` and installed/lock comparison | Passed; installed top-level versions match lockfile |
| `npm run typecheck` | Passed |
| `prisma validate` using a dummy loopback DATABASE_URL | Passed; syntax/model validation only |
| `npm run lint` with noninteractive stdin | Failed/stopped at first-run ESLint configuration prompt; no config created |
| Temporary ESLint Next core-web-vitals baseline | 23 errors: 22 `rules-of-hooks` naming reports for ordinary `useDemoData()` calls; one unescaped apostrophe in `app/not-found.tsx`. These naming reports do not prove actual hook execution errors. |
| `npm run build`, forced demo mode, blank provider keys/gate, dummy loopback DB, telemetry disabled | Passed: Prisma generated, Next compiled/type-checked and emitted route output. Build's lint phase is not a substitute for the missing configured lint check. |
| `npm run test:postgres` (Milestone 1B) | 47 unit + 12 database cases passed; 60 including parent test, 0 failed/skipped. Real PostgreSQL 17.11/pgvector 0.8.7. Fixture cleanup/server shutdown verified. Node22 emitted the existing dependency punycode warning. |
| Targeted temporary Next core-web-vitals lint (Milestone 1) | Passed on changed functional files and tests; project-wide baseline failures remain. |
| Temporary offline probes using `node --import tsx` | Basic captions/times/packing/deep links; demo source/episode/search handlers; cookie validation/rotation passed. Six specific failure/control-flow probes documented in GAP_ANALYSIS. No DB/provider calls. |
| Worker startup probe | Entry point booted with concurrency 1 and auto-sync off against an intentionally closed loopback database; expected connection failure observed; bounded process terminated after 4s. Claiming/processing not verified. |
| Earlier deployed DB read-only audit | Unavailable: connection could not be established; no writes performed. Separate disposable database tests now pass. |
| Docker/Render/Vercel runtime | Configuration inspected only; Docker unavailable, no deploy run |

Temporary audit probes/config were written under `/private/tmp/podchives-audit`. Milestone regression tests are checked in under tests/. The `tsx` CLI hit a sandbox IPC permission error; `node --import tsx` succeeds. Build artifacts and generated client remain ignored local outputs.

## Ownership decision

Keep the current Next.js/Prisma/Postgres worker architecture. Milestone 1 integrity has passed the isolated PostgreSQL acceptance cases in 1B. M2 safe rendering and conservative caption parsing also pass the bounded checks above. Routine engineering continues under FOUNDER_PROTOCOL; major phase/architecture/product decisions and production/provider work retain the documented consultation/authorization boundaries. See [ROADMAP.md](ROADMAP.md).
