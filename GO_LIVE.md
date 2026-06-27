# Go live with real data

This is the minimum path from demo mode to a working searchable archive backed by a real YouTube show, real transcripts, and real embeddings.

If you're just clicking around with demo data, you don't need any of this — `npm run dev` is enough.

---

## Prerequisites (one-time)

- Node 20+
- PostgreSQL 14+ with the `vector` extension available (Supabase has it built in).
- `yt-dlp` and `ffmpeg` on `PATH`:
  ```bash
  brew install yt-dlp ffmpeg
  ```
- An OpenAI API key.

---

## The 6-step checklist

### 1. Set `OPENAI_API_KEY=…` and `DATABASE_URL=…` in `.env`

```bash
cp .env.example .env   # if you haven't already
```

Then edit `.env`:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/podchives
OPENAI_API_KEY=sk-...
```

Used by:
- `OPENAI_API_KEY` → Whisper transcription (`lib/transcription.ts`) + `text-embedding-3-small` (`lib/embeddings.ts`).
- `DATABASE_URL` → Prisma client (`lib/db.ts`), every API route, every worker.

### 2. Set `NEXT_PUBLIC_DEMO_MODE=false`

In `.env`:

```bash
NEXT_PUBLIC_DEMO_MODE=false
```

This flips every page and every API route from `demoData.ts` to real DB reads. While `true`, the app ignores `DATABASE_URL` entirely.

### 3. `CREATE EXTENSION vector;` on Postgres (Supabase included)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Required for the `transcript_segments.transcript_embedding vector(1536)` column declared in `prisma/schema.prisma`. On Supabase, run this once in the SQL editor; on self-hosted Postgres, run it in `psql`.

### 4. `npm run db:push`

```bash
npm run db:push
```

Applies the schema to the database. Creates all 11 tables: `podcasts`, `sources`, `source_sync_jobs`, `episodes`, `downloads`, `processing_jobs`, `transcript_segments`, `search_queries`, `worker_runs`, `scheduler_settings`, `users`.

> Optional: after `db:push`, also create the pgvector index for fast semantic search:
> ```sql
> CREATE INDEX IF NOT EXISTS transcript_segments_embedding_idx
>   ON transcript_segments USING ivfflat (transcript_embedding vector_cosine_ops);
> ```

### 5. Add a YouTube source

Either through the UI:

```
http://localhost:3000/sources  →  paste URL  →  Add source
```

Or one-shot from the CLI:

```bash
npm run sync-source -- "https://www.youtube.com/@channelname"
```

Both paths do the same thing: upsert a `podcast` row, create a `source` row, enqueue a `source_sync` job. The CLI version also runs the sync inline so episodes appear immediately in `/episodes`.

### 6. `npm run worker`

```bash
npm run worker
```

Drains the `processing_jobs` queue continuously. Pipeline per episode:

```
thumbnail_cache → download → audio_extract → transcription
→ transcript_segmentation → embedding → indexing → is_searchable=true
```

Watch progress live at `http://localhost:3000/processing-queue` and `http://localhost:3000/download-manager`.

---

## Acceptance criteria

The app is successful when all of these are true:

1. ✅ I can add one public YouTube show/source.
2. ✅ The app discovers episodes.
3. ✅ Episodes appear in the catalog (`/episodes`).
4. ✅ I can process at least one episode.
5. ✅ The episode is transcribed.
6. ✅ Transcript segments are saved.
7. ✅ I can search for a phrase (`/search?q=…`).
8. ✅ Search results show episode, timestamp, quote, and source.
9. ✅ I can click a result and open the episode at that exact moment.
10. ✅ I can see processing status in Download Manager and Processing Queue.

All ten are met by the steps above.

---

## Not built (deferred per spec)

These are explicitly future features. The data model already supports them — they'll hang off `transcript_segments` and the embeddings that are already there.

- contradiction detection
- speaker voice matching
- facial emotion detection
- "funny moments" / "serious moments"
- advanced AI clipping

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `yt-dlp: HTTP 403` on download | Set `YOUTUBE_COOKIES_FILE=/path/to/cookies.txt` in `.env` and retry the failed job from `/processing-queue`. |
| `OPENAI_API_KEY is not set` from worker | You're in real mode but the env var is missing. Restart the worker after editing `.env`. |
| `relation "podcasts" does not exist` | You skipped step 4. Run `npm run db:push`. |
| `extension "vector" is not available` | You skipped step 3. Run `CREATE EXTENSION vector;` in your DB. |
| App still shows demo data after env changes | Restart `npm run dev` — `NEXT_PUBLIC_*` vars are baked at build/dev-server start time. |
| Worker says "DATABASE_URL not set" | The worker process didn't load `.env`. The npm scripts pick it up automatically; if running `tsx` directly, prefix with `dotenv -e .env --`. |
