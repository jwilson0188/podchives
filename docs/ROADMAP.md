# Podchives implementation roadmap

Baseline `cf83fa6`, audited 2026-10-09. Milestone 1, Milestone 1B and the approved Milestone 2 rendering/caption fixes have passed their bounded local checks. The founder's 2026-10-10 FOUNDER_PROTOCOL authorizes routine existing-architecture fixes and implementation of approved specifications without per-task approval. Major architecture/product/financial/security decisions and product checkpoints still need review; this roadmap does not authorize production operations or paid jobs. Preserve the application and sequence small reviewed changes. The immediate objective is one reliable searchable YouTube episode, then a bounded multi-episode archive, then context discovery and contradiction analysis.

## Milestone 1 — Approved and implemented locally

**Atomic, validated transcript replacement** now runs through `lib/transcriptIntegrity.ts`. The user's milestone expanded the original audit proposal to include episode/attribution/duration validation, atomic metadata updates, search/embedding/job integrity and focused regression tests. This is the authorized scope; later roadmap work remains proposed.

Implemented:

1. Validate/copy the complete dataset before mutation, then revalidate episode metadata under a row lock. Require nonempty segments/text, required source fields, matching attribution, finite nonnegative start/end with end > start, nondecreasing starts and known-duration bounds with a documented two-second tolerance. Preserve repeated dialogue and valid overlaps; packing preserves the maximum overlapping end.
2. Transact replacement, metadata, downstream-job supersession, fresh successor enqueue and current transcription/segmentation completion. Capture existing segment IDs before provider/packing work and reject a stale generation. Preserve append and return-count contracts with consistent validation.
3. Mark replacement embeddings/search pending, verify vector dimensions on write and full current coverage before readiness. Guard superseded workers and indexing jobs. Remove cached search-result reuse on new requests without changing layout or creating a refresh loop.
4. Add Node's existing test runner with tsx (no new dependency), deterministic fixtures and an explicitly opt-in PostgreSQL/pgvector suite. Update the handoff and safe setup instructions.

Acceptance evidence:

- **Pass (unit):** invalid input makes no writes; injected delete/insert/metadata/job/commit failure retains original text/vectors/flags/jobs; other episode data is preserved; repeated dialogue and overlapping fractional timing survive.
- **Pass (unit):** stale snapshots cannot replace/publish newer transcripts; embedding/index readiness requires complete current coverage; pending search filters remain consistent.
- **Pass (Milestone 1B):** 47 unit cases + 12 PostgreSQL cases (60 including parent test), zero skips/failures, typecheck, Prisma validation, targeted lint and demo production build. No expensive jobs or production mutations.
- **Pass (real PostgreSQL):** rollback after delete, including a genuine foreign-key failure; exact old text/vector/metadata/job preservation; complete metadata/readiness publication; two separately connected workers observed waiting on the episode lock; one winner/one rejected stale writer; stale transcription, embedding and indexing completion rejected; old failure cannot cancel fresh jobs. PostgreSQL 17.11 and pgvector 0.8.7 with real GIN/HNSW indexes were used. Deployed service-pooler compatibility remains pending.
- **Pending:** browser navigation/failure behavior and deployed worker integration. Search responses already on screen remain snapshots; no cross-client live invalidation was introduced.

**Migration requirement: none.** Existing schema and transactional index maintenance suffice. Durable transcript version history, separate keyword readiness, upstream caption dedup, general job handoffs/leases and legacy reset-script safety remain outside this implementation.

Milestone 1B is complete: `npm run test:postgres` now provisions a fresh native PostgreSQL cluster, runs the suites, verifies fixture cleanup, stops the server and removes the cluster. No implementation defect surfaced, so no application behavior was changed. The subsequently approved safe transcript highlighting and conservative caption deduplication work is recorded below.

## Milestone 2 — Approved rendering/caption scope implemented locally

- All three transcript display consumers use React text/mark children, with no transcript HTML sink. Literal matches, case and styling are preserved.
- Caption deduplication uses identical explicit inline start/end/text in overlapping YouTube cues. Repeated dialogue at different times and all ambiguous untimed speech remain. Generic feed VTT does not deduplicate. Cue/inline validation rejects malformed timing; numerical speech and Unicode entities are preserved.
- Acceptance passed: 33 new deterministic fixtures plus the original integrity suite; 80 unit + 12 real PostgreSQL cases (93 including parent), zero skipped/failed. Typecheck, Prisma validation, targeted lint and safe demo build pass. No migration/dependency, production writes or paid provider requests.
- Limits: ambiguous untimed rolling copies can remain; live YouTube/browser behavior and prior stored transcript repair are unverified/out of scope. No raw-cue/version archive added. Meaningful project-wide ESLint configuration and CI remain proposed work, not part of this bounded approval.

## M3 increment — Atomic downstream publication completed

Under the autonomous protocol, embedding readiness, one effective indexing successor and embedding-job success now transact together. Final indexing readiness/job success is atomic too. Generation/coverage guards remain; repeat success is idempotent, late failures preserve committed work, and reclaimed indexing rows are reused. Acceptance: 97 unit + 23 PostgreSQL cases (121 including parent), zero failures/skips, including real rollback and two-session contention. No schema, new infrastructure or provider expense.

**Media continuation completed:** thumbnail/download/audio-extract completion and successor admission now transact under the Episode lock; maintenance enqueue is serialized too. Twenty unit and thirteen real DB regressions added; current total 117 unit + 36 PostgreSQL cases (154 including parent), zero failures/skips. Artifact writes/provider work are still separate.

**Episode admission/resume completed:** shared Source → Episode transactions prevent concurrent initial duplicate admissions and enforce existing source pressure thresholds. Resume uses stored transcript/vector/stage evidence and local artifact availability without resetting data. Segmentation with inconsistent flags is claimable via transcript-row evidence. 127 unit + 47 PostgreSQL cases (175 including parent), zero failures/skips. Limits and exact evidence are in CURRENT_STATE/EXECUTION_LOG.

**Admission/control continuation completed:** source-sync/fallback transactions, per-claim pause and cancellation filtering, and automatic retry exclusions. **Next routine slice:** running-job cancellation guards and explicit retry validation; durable attempt ownership remains separate. Durable attempt leases, transcript versions or broader redesign require a concrete design and founder consultation when they cross the protocol's architecture boundary. Codec/durable storage and paid-provider acceptance remain separate.

## Proposed milestone order

| Milestone | Work | Dependencies | Acceptance / exit criteria |
| --- | --- | --- | --- |
| M1 / M1B — Transcript data integrity and database proof | Complete for bounded acceptance cases above | Native PostgreSQL + pgvector; reproducible temporary-cluster runner | 47 unit and 12 real database cases pass; rollback, competing workers, metadata/readiness and stale completion demonstrated; no production data modified |
| M2 — Correct evidence and safe rendering | Approved React highlighting and conservative timed-span dedup implemented; project lint/CI remain proposed | M1/M1B | Malicious markup is escaped; long-gap/adjacent repetition survives; exact timed rolling replicas removed; 80 unit + 12 DB cases, typecheck, targeted lint and demo build pass. Ambiguous copies remain |
| M3 — Recoverable YouTube jobs | Embedding/indexing publication and media successor handoffs complete; initial episode admission and stage-based local-artifact resume complete; source-sync/fallback admission and per-claim pause complete; running-job cancellation; bounded heartbeat/lease/retries | M1/M2; queue integration DB | Concurrent claims do not collide; duplicate enqueue produces one effective job; crash at handoff does not strand work; stopped jobs stay stopped; completed provider batches are not repeated unnecessarily |
| M4 — Honest state and usable operations | Distinguish demo/real/degraded; report search/DB failures; wire retry/cancel/sync; validate retry status; freshness and paginated catalogs; sync counters/null dates | State semantics from M3 | Failures do not appear as no results; controls change tested state; >200 catalog rows reachable; caption-only jobs visible; stale snapshots clearly identified |
| M5 — Bounded real YouTube acceptance | Staging DB/index installation, one public video, captions first; approved fallback/embedding budget; phrase/timestamp/playback check | M2–M4; service access and cost consent | Complete URL → discovery → transcript → search → playback recorded; repeat sync does not duplicate; failure/retry checked; no unapproved backlog or auto-sync |
| M6 — Search and deployment reliability | Independent FTS readiness; missing-vector checkpoints; ranking/index/limit tests; pinned Docker tools/resource limits; durable artifacts; redacted logging and migration plan | M5 evidence; approved state/design changes | Keyword search works during embedding outage; semantic unavailability is honest; relevance/query plan pass; redeploy recovery works; bounded archive memory/cost measured |
| M7 — Context-aware discovery | Versioned raw cues/chunks; neighboring context, speakers/entities; Moment jobs/models; editable spans/evidence; retrieval evaluation | Reliable pipeline M5/M6; additive schema plan | Every candidate has exact cited span/version/context/reason; manual evaluation checks misleading truncation; jobs resumable and capped |
| M8 — Contradiction analysis | Versioned claims, speaker/topic/time linking; candidate retrieval then contextual analysis; evidence pairs/review | M7; evaluation corpus | Both episodes/context cited; changes of mind, jokes, uncertainty and different speakers distinguished; held-out precision measured; user can confirm/dismiss |

Multi-user release has an additional prerequisite: approved additive Workspace/Organization/Membership design, identity provider and server-side authorization, scoped queries/jobs/caches/search analytics, isolation tests, and migration/backfill review. Do not open the single-user beta to multiple customers simply by replacing the password gate.

## Bounded integration verification plan

Run only after the relevant functional task and any media/provider allowance have been approved:

1. Identify an explicitly disposable/staging database and verify pgvector, current columns and index definitions. Produce aggregate health output; do not log credentials or transcript content unless needed and permitted.
2. Set real mode deliberately on both web and worker; keep `AUTO_SYNC_ENABLED=false`, concurrency 1, per-sync/source caps 1, and source autoSync off. Continuous `npm run worker` has no MAX_JOBS_PER_RUN limit; isolate its DB/queue. Do not point this acceptance run at a shared production backlog.
3. Add one chosen **individual video**, not a channel. Record returned Source/Episode/job IDs, provenance, and state transitions. Confirm thumbnail work cannot block transcript indefinitely.
4. First test the available caption path. No audio download is required when captions succeed. Provider embeddings still incur cost; approve a cap or use fixture embeddings for DB-only testing, clearly labeling the difference.
5. Inspect sorted segments and a known spoken phrase around a manually checked timestamp. Verify finite valid ranges, source attribution, text preservation, and persisted provider/version evidence when implemented.
6. Verify FTS result retrieval, archive scoping, and an actual browser jump/seek to the matching passage. Verify semantic/hybrid results separately if authorized; do not treat demo modes as semantic proof.
7. Re-sync the video and verify no duplicate Source/Episode/effective pipeline. Inject transient failures in the isolated environment; verify rollback, pause/cancel, resume, and redeploy/media-loss behavior.
8. If paid fallback is authorized, use one short approved no-caption fixture and a capped provider request. Record provider/model/actual tokens/duration/cost separately from estimates.
9. Only after one-video proof, approve a small channel/playlist sample and an explicit discovery bound. Existing queue caps do not limit listing/cataloguing the whole channel.

## Planned architecture boundaries

- Keep Next.js App Router and existing pages/API contracts where possible. Refactor `lib/data.ts` after its real/demo/error paths have regression coverage.
- Keep Postgres as the queue initially. Atomic transactions and row locks can address current correctness gaps without adding Redis or another service.
- Use keyword search as the first robust archive retrieval capability, then semantic/hybrid availability and ranking evaluation. Embeddings are already implemented; improve them incrementally.
- Keep source-provided playback for the immediate YouTube archive. Durable media/object storage becomes necessary for redeploy-safe paid audio processing, uploads and rendered exports.
- Plan additive transcript versions and canonical media/source associations before dedup backfills or deleting any duplicate rows.
- Require stable evidence spans/version IDs for contextual analysis and contradictions. Generated labels must link to enough context for a user to assess the claim.

## Later expansion

After the core milestones: harden existing RSS (stream completion, feed parsing, identity and playback), add authorized Patreon connector with scoped credentials, uploaded-file intake/object storage, multi-workspace product flows, persistent saved clips, captions/editor/export, ffmpeg clip rendering and subscription billing with a real usage ledger. Each needs acceptance criteria, cost/retention controls and reviewed migrations. Existing Clip/Caption Engine sketches in `RESUME_TOMORROW.md` can inform implementation; their proposed priority is superseded here by the immediate YouTube reliability objective.

Milestones 1, 1B and the approved rendering/caption portion of 2 are complete within their bounded acceptance scope. Routine engineering now proceeds under FOUNDER_PROTOCOL. Production operations, paid provider jobs, deployments and major product/architecture decisions retain their explicit authorization boundaries. Checkpoint 1 has not yet been demonstrated; M3 is only partially complete.

Current control verification: 127 unit + 58 PostgreSQL cases (186 including parent), zero failures/skips. Typecheck/schema/targeted lint/demo build pass; no migration. Running-job cancellation and manual retry validation are the next routine work; no live archive checkpoint is claimed.

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
