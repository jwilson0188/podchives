# Podchives — Codebase Audit

Audited on branch `feat/rss-feed-transcripts` (working tree as of the `pre-audit snapshot` commit). Read-only audit; no source files were modified.

Confidence is marked throughout. Where I could not verify a claim without running the app or querying the database, I say so rather than guessing.

---

## 1. What this app does and how it's wired

Podchives ingests podcast back-catalogs from YouTube channels and RSS feeds, transcribes every episode, and makes the transcripts searchable down to the timestamp. A **Source** (a YouTube channel/playlist/video, or an RSS feed URL) belongs to a **Podcast**, and syncing a source discovers **Episodes**; each episode is eventually broken into **TranscriptSegments** carrying a pgvector embedding.

The app is Next.js 14 App Router, split into a `(dashboard)` route group of server components that call `lib/data.ts` directly, plus a thin `app/api/*` layer used for client-side polling and mutations. All heavy lifting is deliberately kept out of the web process: API routes only enqueue rows into the `processing_jobs` table, and a separate Render Docker worker (`npm run worker` → `scripts/dev-worker.ts`) polls that table.

The per-episode pipeline is a linked list defined in `lib/pipeline.ts`: `thumbnail_cache → download → audio_extract → transcription → transcript_segmentation → embedding → indexing`. Only one job per episode exists at a time — on success, `enqueueNextPipelineJob` creates the next one, skipping steps that don't apply. `workers/processingWorker.ts` is the dispatcher, claiming jobs via a raw `FOR UPDATE SKIP LOCKED` query in `getNextQueuedJob` and routing by `job_type`.

Transcription has three sources, cheapest first: free YouTube captions, transcripts advertised in an RSS feed's `<podcast:transcript>` tag, and paid Groq/OpenAI Whisper on downloaded audio. The default backend (`youtube_captions_then_groq`) is what makes the archive affordable — it skips the ~50 MB audio download entirely for YouTube episodes.

Auth is a single shared beta password: `middleware.ts` gates everything behind a cookie holding `sha256(BETA_PASSWORD)`. Search runs as raw SQL in `lib/search.ts` in three modes (Postgres full-text, pgvector cosine, and RRF hybrid). Throughout, a demo mode backed by `lib/demoData.ts` shadows every real data path so the app renders without a database.

---

## 2. Broken or likely-broken

### 2.1 — Transcription jobs can never be claimed for caption/feed-transcript episodes ⚠️ **This is almost certainly your missing-episodes bug**

**File:** [lib/queue.ts:465](lib/queue.ts:465)

The dispatcher will only hand out a `transcription` job when the episode has audio on disk:

```
(pj.job_type = 'transcription' AND e.audio_file_path IS NOT NULL)
```

But the whole point of the default backend is to *never download audio*. Three independent code paths route an episode to `transcription` with `audio_file_path` still `NULL`:

- [lib/queue.ts:77-79](lib/queue.ts:77) — episode has an RSS feed transcript → first step is `transcription`
- [lib/queue.ts:80-82](lib/queue.ts:80) — YouTube + captions backend → first step is `transcription`
- [lib/queue.ts:120-136](lib/queue.ts:120) — `enqueueNextPipelineJob` skips `download`/`audio_extract` for those same episodes
- [workers/processingWorker.ts:156-167](workers/processingWorker.ts:156) — even if a `download` job runs, it returns early **without setting `audioFilePath`**

The transcription worker itself is explicitly built to handle this case — [workers/transcriptionWorker.ts:41](workers/transcriptionWorker.ts:41) only errors when there's no audio *and* no captions *and* no feed transcript, and [lib/transcription.ts:267-301](lib/transcription.ts:267) resolves captions and feed transcripts before ever touching audio. So the worker is ready; the SQL gate never gives it the job.

Net effect: those `transcription` rows sit in `queued` forever. Nothing fails, nothing errors, nothing retries — the queue just quietly stops making progress. `TRANSCRIPTION_BACKEND=youtube_captions_then_groq` is set in [render.yaml](render.yaml), so this is live in production, and it's also the default when the env var is unset ([lib/transcriptionConfig.ts:10](lib/transcriptionConfig.ts:10)).

This predates the `Fix queue deadlock…` commit (`68c86bc`) — that commit reordered job priority and added downstream cancellation but never touched this eligibility predicate. `git log -S` confirms the clause has been there since the initial commit.

**Fix:** Extend the `transcription` branch of the `getNextQueuedJob` predicate to also admit episodes with a non-null `transcript_original_url` or a YouTube `source_platform`, mirroring the conditions the transcription worker already accepts.

**Verify first:** `SELECT job_type, status, count(*) FROM processing_jobs GROUP BY 1,2;` — if there's a large, unchanging pile of `queued` / `transcription`, this is confirmed.

### 2.2 — The stalled jobs then throttle *new* episodes to zero (compounding)

**File:** [lib/queue.ts:232-281](lib/queue.ts:232), [lib/queue.ts:330](lib/queue.ts:330)

`countSourcePipelinePressure` counts **queued** pipeline jobs per source, and `canQueueEpisodeForSource` refuses to queue anything new once that count hits `maxQueuedEpisodesPerSource` (50 for YouTube, 75 for RSS in [render.yaml](render.yaml)).

The stuck `transcription` jobs from 2.1 are counted as queued and never drain. So after roughly 50–75 episodes, `queueEpisodeProcessingIfNeeded` returns `false` for every subsequent episode, permanently. New episodes still get **upserted** into the `episodes` table by the sync workers ([workers/youtubeIngestWorker.ts:110](workers/youtubeIngestWorker.ts:110), [workers/rssIngestWorker.ts:76](workers/rssIngestWorker.ts:76)) — they just never get a pipeline. That produces exactly the symptom of episodes appearing in the archive but never becoming searchable, and it explains why re-syncing doesn't help despite the "will drain on next sync" comment at [workers/youtubeIngestWorker.ts:141](workers/youtubeIngestWorker.ts:141).

**Fix:** Fixing 2.1 drains this on its own, but the backpressure counter should also exclude jobs that have been `queued` beyond some age so a single unclaimable job can never wedge a source again.

### 2.3 — No fallback to audio when captions are unavailable

**File:** [lib/transcription.ts:303-307](lib/transcription.ts:303)

If YouTube captions fail and there's no feed transcript and no audio was downloaded (because the backend deliberately skipped it), `resolveTranscription` throws. `runTranscriptionJob` then calls `markJobFailed`, which calls `cancelOrphanedDownstreamJobs` ([lib/queue.ts:588](lib/queue.ts:588)) — killing the rest of that episode's pipeline. The episode is permanently dead with no path to recovery, even though downloading the audio would have worked. Any episode with captions disabled is silently lost.

**Fix:** On caption/feed-transcript failure, enqueue a `download` job for that episode instead of throwing, so it falls back to the paid Whisper path.

### 2.4 — Episodes page is hard-capped at 200 with no pagination

**File:** [lib/data.ts:594](lib/data.ts:594), [app/(dashboard)/episodes/page.tsx:10](app/(dashboard)/episodes/page.tsx:10)

`getEpisodes` ends in `take: filters.limit ?? 200` and the Episodes page calls it with no arguments. The page header promises "Every video, livestream, and recording" but will never show episode 201. For a multi-year podcast back-catalog this alone looks like "not archiving all episodes" even when ingestion is healthy. The API route at [app/api/episodes/route.ts](app/api/episodes/route.ts) has the same ceiling and accepts no limit/offset params.

**Fix:** Add offset/cursor pagination through `getEpisodes` and the episodes API, and surface a "load more" control in the catalog view.

### 2.5 — `publishDate DESC` puts undated episodes first, not last

**File:** [lib/data.ts:593](lib/data.ts:593), [lib/data.ts:784](lib/data.ts:784)

Both `getEpisodes` and `getRecentEpisodes` order by `publishDate: "desc"` with no null handling. Postgres defaults `DESC` to `NULLS FIRST`, so every episode with no publish date sorts *above* every dated one — consuming the 200-row cap from 2.4 and dominating the dashboard's "recent episodes".

This matters because `syncYouTubeSource` discovers videos with `--flat-playlist` ([lib/youtube.ts:348](lib/youtube.ts:348)), and flat-playlist output frequently omits `upload_date`/`timestamp`. `parseInfoLine` maps that to `publishDate: null` ([lib/youtube.ts:292-299](lib/youtube.ts:292)). **I could not verify how many rows are actually affected without querying the database** — the docstring at [lib/youtube.ts:339](lib/youtube.ts:339) says entries get enriched individually for accurate dates, but I found no code that does that enrichment. Worth checking with `SELECT count(*) FROM episodes WHERE publish_date IS NULL;` before acting.

**Fix:** Add `nulls: "last"` to both `orderBy` clauses, and separately decide whether the sync should backfill dates via a per-video metadata fetch.

### 2.6 — Demo mode is the default, and it silently replaces the whole archive

**File:** [lib/constants.ts:4-5](lib/constants.ts:4)

```ts
export const IS_DEMO_MODE =
  (process.env.NEXT_PUBLIC_DEMO_MODE ?? "true").toLowerCase() === "true";
```

If `NEXT_PUBLIC_DEMO_MODE` is ever missing from the web deployment's environment, every page renders fabricated demo data with no visible error — indistinguishable from a real archive that lost its episodes. Worse, `NEXT_PUBLIC_*` vars are inlined at **build** time, so setting it correctly at runtime on an already-built deployment does not take effect for client components, while server-side `useDemoData()` reads `process.env` at request time. The two halves can disagree.

**Fix:** Default this to `false` and make demo mode strictly opt-in, so a misconfiguration produces an obvious empty state rather than convincing fake data.

### 2.7 — `search.ts` degrades differently from `data.ts`

**File:** [lib/search.ts:41](lib/search.ts:41), [lib/search.ts:113](lib/search.ts:113), [lib/search.ts:186](lib/search.ts:186)

Search checks bare `IS_DEMO_MODE`, while everything in `lib/data.ts` uses `useDemoData()` (which is `IS_DEMO_MODE || !hasDatabase()`). With `NEXT_PUBLIC_DEMO_MODE=false` and no `DATABASE_URL`, data functions degrade gracefully to demo content but search throws from `getDb()`.

**Fix:** Have `lib/search.ts` call `useDemoData()` so both modules share one definition of "no real data available".

### 2.8 — RSS audio download returns before the file is flushed

**File:** [lib/rss.ts:300-323](lib/rss.ts:300)

The read loop calls `file.write(...)` without ever awaiting drain, then `file.end()` inside `finally`, then immediately checks `fs.existsSync(target)` and returns. `end()` is asynchronous — the `finish` event is never awaited, so the function can return while bytes are still buffered. The caller then `statSync`s the file for `audioBytes` ([workers/processingWorker.ts:210](workers/processingWorker.ts:210)) and hands the path to transcription. Ignoring `write()`'s backpressure return value also buffers whole episodes in memory.

**Fix:** Await a promise wrapping the stream's `finish`/`error` events (or use `stream.pipeline`) before returning the path.

### 2.9 — Cached thumbnails are downloaded and then never used

**File:** [lib/utils.ts:138-153](lib/utils.ts:138), [lib/youtube.ts:413](lib/youtube.ts:413)

`resolveThumbnailUrl` only honors `localPath` when it already looks like an `http(s)` URL. The `thumbnail_cache` job writes an **absolute filesystem path** to `thumbnail_local_path` ([workers/processingWorker.ts:140-143](workers/processingWorker.ts:140)), which never matches, so the branch is dead. Every thumbnail job spends a network round-trip and disk write for a file no page ever reads — on Render's ephemeral disk, which is wiped on deploy anyway.

**Fix:** Either serve cached thumbnails through a route that reads the local path, or drop the `thumbnail_cache` step and rely on `thumbnail_original_url`.

### 2.10 — RSS episodes get fabricated YouTube thumbnail URLs

**File:** [lib/utils.ts:149-151](lib/utils.ts:149)

The final fallback builds `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg` for *any* `externalId`, regardless of platform. For RSS episodes `externalId` is a feed GUID or an enclosure URL ([lib/rss.ts:136-140](lib/rss.ts:136)), so this produces a broken image link instead of the placeholder.

**Fix:** Guard that fallback on `sourcePlatform === "youtube"` and return the placeholder otherwise.

### 2.11 — Sync history counters are always zero

**File:** [workers/youtubeIngestWorker.ts:153-156](workers/youtubeIngestWorker.ts:153), [workers/rssIngestWorker.ts:119-122](workers/rssIngestWorker.ts:119)

`SourceSyncJob` defines `episodesFound`, `episodesAdded`, and `episodesUpdated` ([prisma/schema.prisma:66-68](prisma/schema.prisma:66)), and both workers compute those numbers — then complete the row with only `status` and `completedAt`, discarding them. The counts are returned to a caller that ignores them. Any UI or debugging that relies on sync history sees zeros, which is precisely the data you'd want when diagnosing missing episodes.

**Fix:** Include the computed `episodesFound`/`episodesAdded` values in the `sourceSyncJob.updateMany` call.

### 2.12 — Scheduler ignores the database settings it reads

**File:** [workers/scheduler.ts:88](workers/scheduler.ts:88), [workers/scheduler.ts:64](workers/scheduler.ts:64)

`runOnce` builds its config from `readSchedulerOptions()` (env only). `loadSchedulerSettings()`, which reads the `scheduler_settings` table so the Settings page can change behavior live, has **zero callers**. Anything a user changes in that table is silently ignored.

**Fix:** Make `runOnce` await `loadSchedulerSettings()` instead of `readSchedulerOptions()`.

### 2.13 — Auto-retry resurrects user-cancelled jobs

**File:** [workers/scheduler.ts:95-105](workers/scheduler.ts:95)

`runOnce` re-queues *every* job with `status: "failed"` and `retryCount < 3`, with no filter on `errorMessage`. `stopSourceSync` marks user-cancelled work as `failed` with the message `"Stopped by user"` ([lib/queue.ts:386](lib/queue.ts:386), [lib/queue.ts:407-424](lib/queue.ts:407)). Pressing "stop sync" and later running the scheduler restarts the work the user explicitly stopped.

**Fix:** Exclude jobs whose `errorMessage` is the cancellation sentinel from the retry sweep.

### 2.14 — Cancelled jobs are recorded as `completed`

**File:** [lib/queue.ts:547-567](lib/queue.ts:547)

`cancelOrphanedDownstreamJobs` sets cancelled downstream jobs to `status: "completed"` with `progressPercent: 0` and an error message. They then count as completed in every dashboard statistic, overstating progress. (The `errorMessage` is load-bearing elsewhere — [lib/queue.ts:148-158](lib/queue.ts:148) distinguishes real completions by `errorMessage: null` — so this can't be changed without touching that check too.)

**Fix:** Introduce a distinct `cancelled` status and update the queries that currently treat `completed`-with-an-error as cancelled.

### 2.15 — Re-sync endpoint has no duplicate guard

**File:** [app/api/sources/[id]/sync/route.ts:38-42](app/api/sources/[id]/sync/route.ts:38)

The endpoint creates a `source_sync` job unconditionally. `enqueueDueSourceSyncs` does check for an in-flight sync before enqueuing ([lib/queue.ts:371-379](lib/queue.ts:371)); this route does not. Repeated clicks on "Sync now" stack duplicate full-channel syncs.

**Fix:** Reuse the same in-flight check before creating the job, and return the existing job when one is pending.

### 2.16 — Dashboard cache has no TTL and can outlive the data

**File:** [lib/dashboardCache.ts:64-121](lib/dashboardCache.ts:64), [lib/sessionStore.ts](lib/sessionStore.ts)

`mergeDashboardWithStash` falls back to a `sessionStorage` snapshot whenever the server payload looks empty, and `writeSessionJson` stores it with no timestamp or expiry. A deleted source or a stale episode count can survive indefinitely within a browser session, and the merge prefers the stash on any transient blip. When diagnosing "episodes are missing", this layer can also mask or invent state.

**Fix:** Store a timestamp alongside the payload and ignore stashes older than a short window.

### 2.17 — Empty archive costs four full dashboard round-trips

**File:** [lib/data.ts:335-342](lib/data.ts:335), [lib/data.ts:277-296](lib/data.ts:277)

`getCockpitSummaryWithRetry` retries until `cockpitIsComplete`, which is false whenever there are no sources *and* no episodes — indistinguishable from a failed query. A genuinely empty archive therefore runs `getCockpitSummary` four times (each ~7 queries, some with their own internal 3× retry loops and sleeps) and adds roughly a second of latency before rendering the empty state.

**Fix:** Distinguish "query failed" from "no data" — have the inner functions signal failure explicitly instead of inferring it from emptiness.

---

## 3. Duplicated or dead code

### Dead exports (defined, zero callers — verified by grep across `app/`, `components/`, `lib/`, `workers/`, `scripts/`, `hooks/`)

| Symbol | Location |
|---|---|
| `queueEpisodeProcessing` | [lib/queue.ts:57](lib/queue.ts:57) — superseded by `queueEpisodeProcessingIfNeeded` |
| `processJob` | [lib/queue.ts:617](lib/queue.ts:617) — re-export wrapper nobody imports |
| `saveEpisodeMetadata` | [lib/youtube.ts:601](lib/youtube.ts:601) |
| `loadSchedulerSettings` | [workers/scheduler.ts:64](workers/scheduler.ts:64) — see 2.12 |
| `runOvernightProcessing` | [workers/scheduler.ts:116](workers/scheduler.ts:116) — alias for `runOnce` |
| `getAllProcessingJobs` | [lib/data.ts:980](lib/data.ts:980) |

### Dead components

- [components/dashboard/LivePipelineStrip.tsx](components/dashboard/LivePipelineStrip.tsx) — no importers; `PipelineStrip` is the one actually rendered
- [components/episodes/EpisodeCard.tsx](components/episodes/EpisodeCard.tsx) — no importers; typed against `DemoEpisode`, superseded by `EpisodeGridCard`

### Duplicated logic

- **`dashboardHasArchiveData` and `cockpitSourcesMissing` exist twice**, with identical bodies, in [lib/data.ts:324](lib/data.ts:324)/[lib/data.ts:344](lib/data.ts:344) and [lib/dashboardCache.ts:21](lib/dashboardCache.ts:21)/[lib/dashboardCache.ts:60](lib/dashboardCache.ts:60). `DashboardShell.tsx` imports the cache copies while `data.ts` uses its own — so a fix to one silently misses the other.
- **Episode upsert is written twice**: [lib/youtube.ts:609-622](lib/youtube.ts:609) (`saveEpisodeMetadata`, dead) and inline at [workers/youtubeIngestWorker.ts:110-123](workers/youtubeIngestWorker.ts:110).
- **`updatePodcastBranding` is near-identical** in [workers/youtubeIngestWorker.ts:26-47](workers/youtubeIngestWorker.ts:26) and [workers/rssIngestWorker.ts:16-39](workers/rssIngestWorker.ts:16) — same shape, same guard, different field names.
- **The entire sync loop body is duplicated** between the two ingest workers ([workers/youtubeIngestWorker.ts:102-158](workers/youtubeIngestWorker.ts:102) vs [workers/rssIngestWorker.ts:67-124](workers/rssIngestWorker.ts:67)): same backpressure accounting, same progress math, same completion writes, same error handling. Bug 2.11 exists identically in both because of it.
- **Deprecated re-export** of `detectYouTubeSourceType` at [lib/youtube.ts:320](lib/youtube.ts:320), still imported by `workers/youtubeIngestWorker.ts` rather than from `lib/sourceTypes`.

### Dead configuration

- `MAX_JOBS_PER_RUN: "15"` in [render.yaml](render.yaml) has no effect: the Docker `CMD` runs `npm run worker` → `scripts/dev-worker.ts` → `processConcurrently`, which never receives `maxJobs`. Only `scripts/process-queue.ts` (the `runOnce` path) honors it.
- `OVERNIGHT_PROCESSING_ENABLED: "false"` is likewise unread on the `dev-worker` path.
- `render.yaml` pins `branch: main`, so nothing on the current feature branch deploys — expected, but worth stating since it affects how you test any fix.

### Not a code issue

The untracked `storage:cookies.txt` in the repo root is **not** produced by any code — I grepped for a literal `storage:` and found none. It looks like a manual shell mishap (`storage:cookies.txt` instead of `storage/cookies.txt`). It contains live YouTube session cookies and is now gitignored.

---

## 4. Structural problems

**Pipeline rules live in two places, and one of them is a raw SQL string.** The dispatcher's eligibility logic ([lib/queue.ts:456-471](lib/queue.ts:456)) encodes preconditions for each job type in SQL, while the TypeScript in `resolveFirstPipelineJob` and `enqueueNextPipelineJob` encodes *which* job to create next — and `lib/transcription.ts` independently decides what inputs it can accept. Bug 2.1 is exactly what happens when these drift: two layers each behaving correctly by their own rules, producing a deadlock neither can see. As long as the SQL predicate is a separate source of truth, this class of bug will recur with every new pipeline step. This is the single most important thing to restructure.

**`lib/data.ts` is a 1,475-line god-module.** It holds view types, demo fallbacks, stats aggregation, episode queries, job queries, usage/cost math, and a search wrapper. Every dashboard page imports from it, so any change touches everything, and it's the natural home for the duplicated helpers noted above.

**Demo mode doubles every data path.** Nearly every function in `lib/data.ts` and `lib/search.ts` opens with a demo branch returning fabricated data. That's two implementations of every query to keep in sync, no type-level guarantee they return the same shape, and — because demo is the *default* (2.6) — a configuration mistake looks like working software. It also makes the real path effectively untested.

**Three layers of caching exist to work around one unreliable database connection.** `getCockpitSummaryWithRetry` retries server-side; `DashboardShell` re-fetches from `/api/dashboard/cockpit` on the client when SSR looks empty; `dashboardCache` merges in a `sessionStorage` stash. All three exist because Prisma is pinned to `connection_limit=1` for serverless ([lib/db.ts:24](lib/db.ts:24)) and queries drop under pool pressure. Each layer adds a way for the UI to show something other than what's in the database — a serious liability when the bug you're chasing is "data is missing". Fixing the pooling would let all three go away.

**There are no tests at all.** No `*.test.*` or `*.spec.*` files exist anywhere, though six `NODE_ENV !== "test"` guards in `lib/` and `workers/` show tests were once intended. The queue state machine — job eligibility, pipeline transitions, backpressure — is pure logic over a small state space and is exactly the kind of code that a handful of tests would have protected. Bug 2.1 would be caught by a single test asserting that a caption-only episode's `transcription` job is claimable.

**Source types are loose strings.** `sourceType` is a bare `String` in the schema ([prisma/schema.prisma:42](prisma/schema.prisma:42)) with the valid values listed only in a comment, and the code checks for both `"rss"` and `"rss_future"` in several places ([lib/queue.ts:200](lib/queue.ts:200), [workers/sourceSyncWorker.ts:18-21](workers/sourceSyncWorker.ts:18)). Adding a platform means finding every ad-hoc string comparison.

**Storage assumes a persistent local disk that doesn't exist.** `lib/storage.ts` writes under `process.cwd()/storage`, but the worker runs in a container with an ephemeral filesystem. Audio is transient by design, but `thumbnail_local_path` persists absolute paths into the database that are meaningless to the web app on another host — which is why 2.9 is dead code rather than a broken link.

---

## 5. Ranked fix list

Ordered by impact ÷ risk. Risk is the chance of breaking something else while making the change.

| # | Issue | File | Risk |
|---|---|---|---|
| 1 | Transcription jobs unclaimable without audio — the archive stalls silently | [lib/queue.ts:465](lib/queue.ts:465) | **LOW** |
| 2 | Sync history counters discarded, hiding exactly this class of failure | [workers/youtubeIngestWorker.ts:153](workers/youtubeIngestWorker.ts:153), [workers/rssIngestWorker.ts:119](workers/rssIngestWorker.ts:119) | **LOW** |
| 3 | Undated episodes sort first and eat the row cap | [lib/data.ts:593](lib/data.ts:593), [lib/data.ts:784](lib/data.ts:784) | **LOW** |
| 4 | RSS episodes get fabricated YouTube thumbnail URLs | [lib/utils.ts:149](lib/utils.ts:149) | **LOW** |
| 5 | Demo mode defaults to on, silently faking the whole archive | [lib/constants.ts:4](lib/constants.ts:4) | **LOW** |
| 6 | Scheduler retry resurrects user-cancelled jobs | [workers/scheduler.ts:95](workers/scheduler.ts:95) | **LOW** |
| 7 | Re-sync endpoint stacks duplicate full syncs | [app/api/sources/[id]/sync/route.ts:38](app/api/sources/[id]/sync/route.ts:38) | **LOW** |
| 8 | Delete dead exports and two dead components | see §3 | **LOW** |
| 9 | Scheduler ignores DB settings; `loadSchedulerSettings` unused | [workers/scheduler.ts:88](workers/scheduler.ts:88) | **LOW** |
| 10 | RSS audio download returns before the stream flushes | [lib/rss.ts:300](lib/rss.ts:300) | **MEDIUM** |
| 11 | No fallback to audio download when captions are unavailable | [lib/transcription.ts:303](lib/transcription.ts:303) | **MEDIUM** |
| 12 | Backpressure counts unclaimable jobs, wedging a source permanently | [lib/queue.ts:232](lib/queue.ts:232) | **MEDIUM** |
| 13 | Episodes page capped at 200 with no pagination | [lib/data.ts:594](lib/data.ts:594) | **MEDIUM** |
| 14 | `search.ts` degrades differently from `data.ts` without a database | [lib/search.ts:41](lib/search.ts:41) | **MEDIUM** |
| 15 | Dashboard sessionStorage stash has no TTL and can mask real state | [lib/dashboardCache.ts:64](lib/dashboardCache.ts:64) | **MEDIUM** |
| 16 | Duplicated `dashboardHasArchiveData` / `cockpitSourcesMissing` | [lib/data.ts:324](lib/data.ts:324), [lib/dashboardCache.ts:21](lib/dashboardCache.ts:21) | **MEDIUM** |
| 17 | Thumbnail caching does work nothing ever reads | [lib/utils.ts:138](lib/utils.ts:138) | **MEDIUM** |
| 18 | Empty archive triggers four full dashboard query passes | [lib/data.ts:335](lib/data.ts:335) | **MEDIUM** |
| 19 | Dead `MAX_JOBS_PER_RUN` / `OVERNIGHT_PROCESSING_ENABLED` config | [render.yaml](render.yaml) | **MEDIUM** |
| 20 | Cancelled jobs recorded as `completed`, inflating progress stats | [lib/queue.ts:547](lib/queue.ts:547) | **HIGH** |
| 21 | Consolidate the duplicated ingest-worker sync loop | [workers/youtubeIngestWorker.ts:102](workers/youtubeIngestWorker.ts:102), [workers/rssIngestWorker.ts:67](workers/rssIngestWorker.ts:67) | **HIGH** |
| 22 | Unify pipeline eligibility rules — remove the SQL/TS split (root cause of #1) | [lib/queue.ts:456](lib/queue.ts:456), [lib/pipeline.ts](lib/pipeline.ts) | **HIGH** |
| 23 | Add tests for the queue state machine | — | **HIGH** |
| 24 | Split `lib/data.ts` and collapse the demo-mode branching | [lib/data.ts](lib/data.ts) | **HIGH** |
| 25 | Fix Prisma pooling and remove the three-layer dashboard cache stack | [lib/db.ts:24](lib/db.ts:24) | **HIGH** |

**Suggested order:** #1 alone should restart your archive — it's a narrow change to one SQL predicate. Do #2 at the same time so you can actually observe whether it worked. Then #12 so a single bad job can never wedge a source again, and #22 once things are stable, because it's what prevents #1 from happening again.
