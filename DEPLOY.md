# Deploy Podchives — single-user beta

This is the canonical deploy path. Everything is on a free tier or a small fixed monthly fee. There's no SSH and no manual server management.

```
GitHub (code, free)
    │
    ├─ push ─→ Vercel       Next.js app + API routes (free Hobby)
    │
    └─ push ─→ Render       background worker, always on ($7/mo Starter)
                  │
                  └─ reads/writes ─→ Supabase
                                       ├─ Postgres + pgvector  (free → $25/mo Pro)
                                       └─ Storage (optional, later)

OpenAI API ─→ Whisper + text-embedding-3-small  (pay-per-use)
```

You'll set environment variables in two places:
- **Vercel** (the web app)
- **Render** (the worker)

Both connect to the same **Supabase** database.

The app is **gated behind a single password** in production via `BETA_PASSWORD` so nobody else can trigger ingestion or run up your OpenAI bill. When real auth ships later, the gate gets ripped out.

---

## Prerequisites (10 min total)

1. **GitHub account** with this repo pushed up.
2. **Supabase account** — [supabase.com](https://supabase.com), free.
3. **Vercel account** — [vercel.com](https://vercel.com), free.
4. **Render account** — [render.com](https://render.com), credit card required for paid worker.
5. **OpenAI account** with billing enabled and an API key.

---

## Step 1 — Supabase project (5 min)

1. New project → name `podchives` → strong DB password → region near you.
2. Wait ~2 min for provisioning.
3. **Enable pgvector.** In the Supabase SQL editor, run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. **Grab the connection string.** Project Settings → Database → **Connection string** → **URI**. Copy the one under **"Transaction"** pooler (port 6543) — that's the one Vercel/Render serverless functions should use. It looks like:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
   Save this as your `DATABASE_URL`. You'll paste it into Vercel and Render.

> If you also want a **direct (non-pooled) connection** for `prisma db push` from your laptop, copy the "Direct" string (port 5432) too. Pooler is fine for app/worker; direct is recommended for migrations.

---

## Step 2 — Apply schema (2 min, from your laptop)

From the project root:

```bash
# Use the DIRECT connection string for migrations, not the pooler.
DATABASE_URL="<your-direct-string>" npm run db:push
```

This creates all 11 tables in Supabase. Verify in Supabase → Table Editor that you see `podcasts`, `sources`, `episodes`, `transcript_segments`, etc.

> Optional: also create the pgvector index for fast semantic search:
> ```sql
> CREATE INDEX IF NOT EXISTS transcript_segments_embedding_idx
>   ON transcript_segments USING ivfflat (transcript_embedding vector_cosine_ops);
> ```

---

## Step 3 — Generate a beta password and a session secret (30 sec)

```bash
# Pick anything memorable but long. This is what you type to log in.
openssl rand -base64 24
# → e.g. 8KTzR3+Hq0e1JrZQ2vQKxYhS6wD/TYNb
```

Save the output — you'll paste it into Vercel as `BETA_PASSWORD`.

---

## Step 4 — Deploy the web app to Vercel (3 min)

1. Vercel dashboard → **Add New** → **Project** → import your GitHub repo.
2. Framework preset: **Next.js** (auto-detected).
3. **Environment Variables** — add all of these:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase pooler connection string from Step 1 |
   | `OPENAI_API_KEY` | Your OpenAI key |
   | `NEXT_PUBLIC_DEMO_MODE` | `false` |
   | `BETA_PASSWORD` | The string from Step 3 |
   | `PROCESSING_MODE` | `render-worker` |

4. Click **Deploy**.

When the build finishes, you have a URL like `podchives-<you>.vercel.app`. Visit it — you should hit the password gate at `/login`. Enter your `BETA_PASSWORD` → land on `/dashboard`.

> If you skip `BETA_PASSWORD`, the app is **wide open**. Don't ship without it.

---

## Step 5 — Deploy the worker to Render (3 min)

The repo already has [`render.yaml`](./render.yaml) — Render reads it automatically.

1. Render dashboard → **New** → **Blueprint** → connect your GitHub repo.
2. Render detects `render.yaml` and proposes a `podchives-worker` service.
3. **Set the secret env vars** in Render's UI (they're marked `sync: false` in the yaml so they aren't auto-set):
   - `DATABASE_URL` — same Supabase string as Vercel
   - `OPENAI_API_KEY` — same key as Vercel
4. **Apply** → Render builds and starts the worker. Tail the logs — you should see:
   ```
   [dev-worker] polling for queued jobs (Ctrl+C to stop)…
   ```

> The worker doesn't need `BETA_PASSWORD` — it talks to the DB directly, not through the web app.

---

## Step 6 — End-to-end smoke test (5 min)

1. Open your Vercel URL → log in with the beta password.
2. Go to `/sources` → paste your real YouTube show URL → **Add source**.
3. The Render worker picks up the `source_sync` job within ~5 seconds. Watch `/processing-queue` — you should see episodes flow through:
   ```
   queued → downloading → transcribing → embedding → indexing → ✓ ready
   ```
4. After the first episode finishes (typically 1–3 min for a 30-minute episode), open `/search` and search for a phrase you know was said.
5. Click a result → it opens the episode at the exact timestamp. ✅

---

## Operating it

| Task | How |
| --- | --- |
| Pause processing | Render dashboard → suspend the worker. |
| Re-process a failed job | `/processing-queue` → **Retry** button on the failed row. |
| Add a new source | `/sources` → paste URL. Or `npm run sync-source -- <url>` from your laptop against the same DB. |
| Rotate the beta password | Vercel → env var → update `BETA_PASSWORD` → redeploy. Every existing cookie immediately invalidates. |
| Tail worker logs | Render dashboard → service → **Logs**. |
| Tail web logs | Vercel dashboard → project → **Logs**. |
| Inspect DB | Supabase → Table Editor or SQL editor. |
| Cost check | OpenAI dashboard → Usage. Set a hard monthly cap. |

---

## When you're ready to open it to other users

This deploy is **single-user**. Multi-tenancy needs:

1. Replace `BETA_PASSWORD` gate with **Supabase Auth**.
2. Add `user_id` ownership column on `podcasts`, `sources`, `episodes`, `transcript_segments`, `processing_jobs`, `downloads`.
3. Add **Row-Level Security policies** so each user only sees their own data.
4. Update API routes to use the user's Supabase session token.
5. Worker keeps using the **service role key** to bypass RLS (it processes everyone's jobs).

That's a separate project — ~2–3 days of focused work. Don't start it until you've validated the engine works on a real show.

---

## Cost reference (June 2026)

| Component | Free | At small beta scale |
| --- | --- | --- |
| GitHub | $0 | $0 |
| Vercel Hobby | $0 (100 GB egress) | $0 |
| Supabase Free | $0 (500 MB DB) | $0 → $25/mo when you outgrow it |
| Render Worker Starter | — | $7/mo |
| OpenAI Whisper | $0.006/min | ~$18 to backfill a 50-episode show, ~$0.36/new episode |
| OpenAI embeddings (text-embedding-3-small) | $0.020/1M tokens | rounding noise |

**Single-show beta total: $7/mo + ~$18 one-time + a few cents per new episode.**
