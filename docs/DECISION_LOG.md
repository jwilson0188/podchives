# Podchives decision log

## 2026-10-10 — Founder authorization: autonomous routine engineering

The founder supplied the [Autonomous Execution & Founder Consultation Protocol](FOUNDER_PROTOCOL.md). It supersedes earlier per-fix approval requirements. Continue routine bug fixes, tests, performance work, minor refactors and approved existing-architecture roadmap implementation independently. Record completed tasks and proceed to the next approved task.

Consult before major architecture or product decisions, financial commitments, sensitive credential/permission/legal/retention changes or destructive migrations. Stop at each defined product checkpoint before entering an unapproved major phase. Use the exact founder-review report in the protocol when a decision is needed. A test failure or ordinary implementation detail is not a consultation trigger. This authorization does not approve production mutations, real provider spend, deployments or indiscriminate archive ingestion.

Current architecture remains Next.js/Prisma/PostgreSQL with a database-backed queue. First autonomous fix: transact embedding readiness, job completion and indexing admission under the existing Episode lock; verify failure and contention in a fresh disposable PostgreSQL cluster. Follow with atomic indexing completion, which has the same split-write defect. No new infrastructure or migration is planned.

## 2026-10-10 — Engineering implementation: atomic downstream publication

Keep the existing Episode row lock as the serialization boundary. Embedding workers supply their job ID to `finishTranscriptEmbedding`; validate current segment IDs, full vector coverage and job ownership/type/state before publishing. Create/reuse the current indexing job and complete embedding in the same transaction. Replacements already supersede previous-generation jobs. Successful repeated completion is a no-op; active indexing retries with diagnostic errors still count as existing work. Indexing readiness and its job completion use one transaction as the next routine fix.

No migration, new queue, new service or paid request. Provider vector batches remain outside the short publication transaction; failed publication retains their valid vectors. The optional no-job helper path preserves its metadata-only compatibility, while the actual worker always supplies a job ID. This does not provide durable versions/leases or exactly-once provider execution. These choices are routine implementation within the founder-approved architecture, not a new product or architecture approval.

## 2026-10-10 — Engineering implementation: media successor transactions

Use `lib/queueTransitions.ts` for pure successor selection plus Prisma transaction boundaries, keeping `lib/queue.ts` as the runtime import surface. Existing source/backend/audio-extension bypasses remain unchanged; no new provider decision. Serialize maintenance enqueue, media completion and media failure under Episode locks, using current job attribution/type/state and completed-success no-op guards. Transcript stages continue through their stronger segment-generation guards. Media downloads/ffmpeg/artifact metadata remain outside short database transactions. Initial admission, file existence, leases and broader cancellation semantics are subsequent work; no claim of exactly-once external processing.

## 2026-10-10 — Engineering implementation: Source → Episode admission locks

Use the existing Source row to serialize competing initial admissions and their source-pressure count, then lock Episode for duplicate-job and resume checks. All admission callers must use the shared wrappers; no new queue or schema. Source changes during admission fail rather than locking a different source out of order. Existing source-cap settings retain their admission meaning; they are not worker concurrency leases.

Resume from real transcript row/vector coverage and existing stage completion evidence before considering media. Retain existing text, metadata flags and paths; inconsistent transcript flags route to validated segmentation, whose SQL eligibility checks for transcript rows. Preserve fresh-source thumbnail/caption/feed bypass behavior. Readable nonempty local files are availability evidence only; no codec inspection or paid provider is invoked. Explicit failed stop markers block automatic readmission; a complete cancellation/retry redesign remains pending. No founder-level architecture/product/financial decision was required.

## 2026-10-10 — Admission and claim controls

Routine existing-architecture fix: retain PostgreSQL queue, serialize source admission with existing Source locks, and fallback with existing Episode/generation guards. Commit fallback failure with download admission so fast-path checks observe failure. Preserve valid stored transcripts on caption-access failure. Observe pause at each claim snapshot; treat any paused settings row as paused, and exclude cancellation markers from automatic retries. No schema or provider choice changed. Running-job interruption/ownership remains explicitly unresolved; full exactly-once provider execution is not claimed.

## 2026-10-10 — Cancellation publication boundary and explicit retry identity

Use existing Source → Episode locks and failed/Stopped by user markers, preserving the schema. A stop prevents subsequent database publication from the cancelled job; it does not kill provider requests or subprocesses. Explicit retry creates a new processing-job ID and retires the previous ID atomically, keeping late workers fenced. Automatic retry/reclaim attempt ownership remains separate. These are bounded routine fixes, not a new queue framework or exactly-once execution guarantee.

## 2026-10-10 — Queue retry presentation

Keep existing status storage and buckets; interpret stop/cancel/supersession markers at presentation time and rename mixed terminal sections honestly. Use the validated fresh-identity retry endpoint; do not mutate fixture state or claim real admission from a demo response. No framework, dependency or schema change.

## 2026-10-10 — Queue read errors and isolated polling

Keep the existing queue data shape with an optional unavailable marker so unrelated dashboard callers remain compatible. The queue endpoint exposes 503 and its page explicitly distinguishes unavailable, stale and successfully empty snapshots. Use a queue-specific hook rather than changing all shared polling consumers in this bounded fix. Serial requests and cleanup guards prevent old responses overwriting refreshed state.

## 2026-10-11 — Download controls without guessed job ownership

Keep the current schema. Permit retry only with one failed download-job candidate and current latest-download evidence rechecked inside the retry transaction; ambiguous history returns 409 with a Processing Queue link. Expose cancellation as Stop episode processing because downstream jobs must stop too. Scope to that episode and preserve saved transcripts. Exact download-to-job linkage remains an additive future improvement.

## 2026-10-11 — Download snapshots and bulk-action scope

Use strict reads for the Download Manager snapshot while preserving unrelated callers. Reuse the tested serial polling controller; fetch referenced episode IDs instead of relying on a truncated episode catalog. Replace inactive bulk sync with the existing Sources navigation rather than adding an unbounded ingestion action. Limits are explicitly displayed; no new infrastructure or schema.
