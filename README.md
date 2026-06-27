# Podchives

> **AI-powered searchable podcast archive platform.**
> Google for podcast moments. A searchable research terminal for podcasts and livestream shows.

**Quick links:** [Demo mode quick start](#quick-start-demo-mode--no-db-no-api-keys) · [Go live with real data](./GO_LIVE.md) · [Architecture](#architecture) · [Project structure](#project-structure)

Podchives ingests episodes from YouTube (channels, playlists, individual videos), transcribes the audio, splits transcripts into timestamped segments, embeds those segments for semantic search, and surfaces a search UI where every result cites back to the exact moment in the original source.

The MVP runs against **one public YouTube show** end-to-end. The architecture (workers, queue, embeddings, scheduler) is built so you can scale to many archives without rewriting it.

---

## What's built

- **Full UI shell** in a dark analyst-terminal aesthetic (Inter, `#FF3D00` accent, `#111111` bg).
- **Demo mode** — set `NEXT_PUBLIC_DEMO_MODE=true` and the app is fully clickable with realistic mock data: 1 archive, 8 episodes, transcript segments, 5 processing jobs in mixed states, 8 downloads, search history, usage stats. No DB required.
- **Pages**: Dashboard · Search · Advanced Search · Archives · Episodes · Episode Detail (with embedded YouTube player + clickable transcript) · Download Manager · Processing Queue · Sources · Usage / Compute · Settings.
- **API routes**: `/api/sources`, `/api/episodes`, `/api/episodes/[id]`, `/api/search`, `/api/processing-jobs`, `/api/processing-jobs/[id]/retry`, `/api/downloads`, `/api/transcripts/[episodeId]`.
- **Database schema** (`prisma/schema.prisma`) for: podcasts, sources, source_sync_jobs, episodes, downloads, processing_jobs, transcript_segments (with pgvector column), search_queries, worker_runs, scheduler_settings, users.
- **Backend services** (`/lib`): `youtube.ts`, `transcription.ts`, `embeddings.ts`, `search.ts`, `queue.ts`, `storage.ts`, `db.ts`.
- **Worker pipeline** (`/workers`): `processingWorker.ts` (dispatcher), `youtubeIngestWorker.ts`, `transcriptionWorker.ts`, `embeddingWorker.ts`, `scheduler.ts` (overnight processing daemon).
- **Scripts** (`/scripts`): `dev-worker.ts`, `process-queue.ts`, `sync-youtube-source.ts`, `seed-demo-data.ts`.

---

## Quick start (demo mode — no DB, no API keys)

```bash
cp .env.example .env
npm install
npm run dev
# open http://localhost:3000
```

Demo mode is on by default. You'll get a fully working UI driven by `lib/demoData.ts`. Search `infrastructure`, `open source`, or `audience` to see real keyword matches against the demo transcripts.

---

## Real data quick start (one YouTube show, end to end)

> **See [`GO_LIVE.md`](./GO_LIVE.md) for the canonical 6-step checklist** (env vars → pgvector → `db:push` → add source → run worker) plus troubleshooting. The summary below is the same flow with more context.

### 1. Prerequisites

- Node 20+
- PostgreSQL 14+ with the `vector` extension (Supabase works out of the box).
- `yt-dlp` and `ffmpeg` on `PATH`:
  ```bash
  brew install yt-dlp ffmpeg
  ```

### 2. Configure

```bash
cp .env.example .env
```

Set:
```bash
DATABASE_URL=postgresql://user:pass@host:5432/podchives
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_DEMO_MODE=false
```

### 3. Migrate

```bash
# Enable pgvector once on your Postgres:
#   CREATE EXTENSION IF NOT EXISTS vector;
npm run db:push
```

### 4. Add a YouTube source and ingest

Either use the UI: open `/sources` → paste a URL → click **Add source** → it enqueues a `source_sync` job.

Or one-shot from the CLI:
```bash
npm run sync-source -- "https://www.youtube.com/@channelname"
```

### 5. Run the worker

```bash
npm run worker
```

The worker will pick up the queued jobs in order: `thumbnail_cache → download → audio_extract → transcription → transcript_segmentation → embedding → indexing → mark searchable`.

### 6. Search

Open `/search`, type a phrase. Each result links to the exact YouTube moment.

---

## Architecture

```
                 ┌───────────────────────┐
   user ───────▶ │  Next.js App Router   │   demo mode → lib/demoData
                 │  (App Shell + APIs)   │   real mode → Postgres + pgvector
                 └─────────┬─────────────┘
                           │ enqueue job
                           ▼
                  ┌────────────────────┐
                  │  processing_jobs   │  ◀── Postgres row-locking queue
                  └────────┬───────────┘
                           │ pulled by
                           ▼
              ┌────────────────────────────┐
              │  workers/processingWorker  │
              │  (one job at a time, w/    │
              │   workerId & retry count)  │
              └─────┬──────────┬──────┬────┘
                    │          │      │
       yt-dlp +     │          │      │   OpenAI Whisper
       ffmpeg       │          │      │   + text-embedding-3-small
                    ▼          ▼      ▼
            ┌─────────────────────────────────┐
            │ episodes  · transcript_segments │
            │           · pgvector embeddings │
            └─────────────────────────────────┘
                           ▲
                           │ keyword + semantic + hybrid
                           │
                  ┌────────┴────────┐
                  │   /api/search   │
                  └─────────────────┘
```

### Flow per episode

1. User adds a source.
2. `source_sync` job runs `yt-dlp` to discover videos.
3. Each video upserts an `episodes` row.
4. Per-episode pipeline is enqueued (`thumbnail_cache → download → audio_extract → transcription → transcript_segmentation → embedding → indexing`).
5. Worker drains the queue. UI polls (or refreshes) to show progress.
6. After indexing, `is_searchable = true` and the segment is queryable from `/search`.

---

## Project structure

```
/app
  /(dashboard)               UI route group — has the AppShell layout
    /dashboard, /search, /advanced-search, /archives,
    /episodes, /episodes/[id], /download-manager,
    /processing-queue, /sources, /usage, /settings
  /api
    /sources, /episodes, /episodes/[id], /search,
    /processing-jobs, /processing-jobs/[id]/retry,
    /downloads, /transcripts/[episodeId]

/components
  /layout      AppShell, Sidebar, TopNav, NavIcon
  /ui          StatusBadge, StatCard, EmptyState, ConfidenceBadge,
               ProgressBar, PageHeader
  /search      GlobalSearchBar, SearchResultCard, FilterPanel
  /episodes    EpisodeCard, EpisodeCatalogTable, EpisodePlayer,
               TranscriptViewer
  /sources     SourceCard, AddSourceForm
  /processing  ProcessingJobRow, ProcessingQueueTable,
               DownloadManagerTable
  /usage       UsageCreditsCard

/lib
  constants.ts       enums (job types, statuses, source types, nav)
  utils.ts           formatting, timestamp URL builder, highlighting
  demoData.ts        rich mock data for demo mode
  db.ts              lazy Prisma client singleton
  youtube.ts         yt-dlp metadata + audio download
  transcription.ts   OpenAI Whisper + segment packing + DB writer
  embeddings.ts      text-embedding-3-small + raw-SQL pgvector writes
  search.ts          keyword (FTS) + semantic + hybrid (RRF) + analytics
  queue.ts           processing_jobs CRUD + atomic claim w/ SKIP LOCKED
  storage.ts         local fs storage abstraction (TODO: S3/Supabase)

/workers
  processingWorker.ts      dispatcher — one job at a time, by jobType
  youtubeIngestWorker.ts   source_sync — discovers videos, enqueues pipeline
  transcriptionWorker.ts   transcription + segmentation
  embeddingWorker.ts       embedding + indexing (mark searchable)
  scheduler.ts             overnight daemon

/scripts
  dev-worker.ts            local polling worker
  process-queue.ts         one-shot drain
  sync-youtube-source.ts   add+sync a source from CLI
  seed-demo-data.ts        write demo rows into a real DB

/prisma
  schema.prisma            full schema, including pgvector column
```

---

## Environment variables

| Var                            | Required                       | Notes |
| ------------------------------ | ------------------------------ | ----- |
| `DATABASE_URL`                 | real mode only                 | Postgres connection string. Supabase is supported. |
| `OPENAI_API_KEY`               | real mode only                 | For Whisper transcription + embeddings. |
| `YOUTUBE_COOKIES_FILE`         | optional                       | Path to a `cookies.txt` for age/region/auth-locked content. |
| `STORAGE_BUCKET`               | optional                       | Reserved for Supabase Storage / S3. Local fs is used when empty. |
| `NEXT_PUBLIC_DEMO_MODE`        | yes                            | `true` (default) → mock data; `false` → talk to the DB. |
| `PROCESSING_MODE`              | optional                       | `local` (default), `render-worker`, `cloud-run`. |
| `OVERNIGHT_PROCESSING_ENABLED` | optional                       | `true` enables the scheduler daemon. |
| `OVERNIGHT_START_TIME`         | optional                       | `HH:MM` (default `02:00`). |
| `MAX_JOBS_PER_RUN`             | optional                       | Default `3`. |

---

## Source attribution (mandatory)

Every search result carries:
- podcast name
- episode title (+ episode number if known)
- source platform (youtube)
- source URL
- publish date
- timestamp start / end
- transcript quote
- a one-click `Copy citation` formatted as:
  ```
  "<quote>" — <Podcast>, <Episode> (Ep. N), <date> @ <mm:ss> — <url-with-?t=Ns>
  ```

The "Jump to timestamp" button opens the original YouTube URL with `?t=Ns`. The "Open episode" button opens the in-app player at the same timestamp; clicking any transcript row scrubs the player there.

---

## Build order (matches the spec)

| Phase | Status | What it covers |
| --- | --- | --- |
| 1. UI shell, demo mode, all pages | ✅ shipped | dashboard, search, episodes, queue, download manager |
| 2. DB schema, source creation, YouTube ingestion | ✅ shipped | Prisma schema, `/api/sources`, `youtubeIngestWorker` |
| 3. Workers, downloads, transcription | ✅ shipped | `processingWorker`, Whisper API, segment packing |
| 4. Keyword search + jump-to-timestamp | ✅ shipped | FTS over `transcript_segments`, `?t=Ns` URLs |
| 5. Embeddings, semantic + hybrid search, scheduler | ✅ shipped | `text-embedding-3-small`, RRF blend, overnight daemon |

---

## Acceptance test (real mode, single show)

1. Add YouTube source via `/sources` or `npm run sync-source -- <url>`. ✅
2. Episodes appear in `/episodes`. ✅
3. Run `npm run worker` — at least one episode processes through the pipeline. ✅
4. Episode is transcribed; segments saved. ✅
5. Search `/search?q=…` returns timestamped quotes. ✅
6. Click result → opens `/episodes/[id]?t=N` and the YouTube embed seeks to N. ✅
7. `/download-manager` and `/processing-queue` show live status, retries, errors. ✅

---

## Things explicitly *not* built (deferred per spec)

- contradiction detection
- speaker voice matching
- facial emotion detection
- "funny moments" / "serious moments"
- advanced AI clipping

These will hang off the same `transcript_segments` table when the time comes — the embeddings + timestamps are already there.

---

## Scripts

```bash
npm run dev              # Next.js dev server
npm run build            # production build
npm run start            # production server
npm run typecheck        # tsc --noEmit
npm run db:generate      # prisma generate
npm run db:push          # apply schema (no migration history)
npm run db:migrate       # create + apply migration
npm run db:studio        # Prisma Studio
npm run seed             # seed demo rows into a real DB
npm run worker           # local dev worker (polling loop)
npm run process-queue    # one-shot drain (cron-friendly)
npm run sync-source -- <url>   # add + sync a YouTube source
```
