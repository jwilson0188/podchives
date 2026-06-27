# Resume here — deploy the Render worker

Last session left off mid-deploy. Web app is live; the background worker is the
last piece. Pick up at **Part A** below.

## Where things stand

- [x] Code pushed to GitHub — `jwilson0188/podchives` (private)
- [x] Vercel web app deployed and **green**; gated behind `BETA_PASSWORD`
      (`k1MBRyPmJzhmSlfDyKHbT2g/S+Fg8Ir5`)
- [x] Supabase Postgres + pgvector live; queue has pending jobs ready to process
- [x] Local worker **stopped**; `caffeinate` exited (Mac can sleep)
- [ ] **Render worker — DO THIS NEXT** (see Part B; `render.yaml` now installs `yt-dlp` + `ffmpeg` at build)
- [ ] Production end-to-end smoke test
- [ ] **Verify Supabase is awake** — local DB check failed with `tenant/user postgres.tghyraygdkbsjvlbrgyb not found` (project may be paused or `DATABASE_URL` needs refresh)

## Part A — Export YouTube cookies (do this first)

1. In Chrome (logged into YouTube), install the extension **"Get cookies.txt LOCALLY"**.
2. Go to https://youtube.com (confirm you're logged in).
3. Click the extension → **Export** → downloads `cookies.txt` (Netscape format, what yt-dlp wants).
4. Keep it handy. **Do not** commit it — it's a credential (already gitignored).

## Part B — Deploy the worker on Render

1. https://dashboard.render.com → **New** → **Blueprint**.
2. Connect GitHub → pick **`jwilson0188/podchives`**. Render reads `render.yaml`
   and proposes a `podchives-worker` service.
3. Set the secret env vars (marked `sync: false`, so not auto-filled):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Same value from local `.env` |
   | `OPENAI_API_KEY` | Same value from local `.env` |

   (`YOUTUBE_COOKIES_FILE` is already hardcoded in `render.yaml` to
   `/etc/secrets/cookies.txt` — no need to set it manually.)

4. **Secret Files** → **Add Secret File**:
   - Filename: `cookies.txt`
   - Contents: paste the entire exported `cookies.txt`
   - Render mounts it at `/etc/secrets/cookies.txt` (matches the env var).
5. **Apply / Create**. Render builds the **Docker image** (`Dockerfile`):
   installs ffmpeg + python3 + yt-dlp, `npm ci`, `prisma generate`, `tsc`,
   then runs `npm run worker`.
6. Tail logs — success looks like:

   ```
   [dev-worker] polling for queued jobs (Ctrl+C to stop)…
   ```

## After the worker is live — smoke test

1. Open the Vercel URL → log in with `BETA_PASSWORD`.
2. `/sources` → paste the YouTube show URL → Add (or rely on existing queued jobs).
3. Watch `/processing-queue`: `queued → downloading → transcribing → embedding → indexing → ready`.
4. `/search` → search a known phrase → click result → opens episode at timestamp. ✅

## Caveats / reminders

- **The worker WILL 403 on downloads without cookies.** Part A is mandatory for the cloud worker.
- **Cookies expire** (weeks–months). When downloads start 403-ing, re-export and update the Render secret file.
- **DB connection:** local `.env` uses Supabase session pooler. If Vercel/Render hit
  connection-limit errors under load, switch `DATABASE_URL` to the transaction pooler (port `6543`).
- **Don't run two workers** long-term. Local worker is already stopped; let Render own processing.
- **Cost:** Render Starter $7/mo + ~$0.30 OpenAI per new sermon. Full 186-episode backfill ≈ $50–65 one-time.

## Handy local commands

```bash
npm run dev                                          # web app locally
npm run worker                                       # local worker (only if Render is off)
npx tsx scripts/check-episode.ts <videoId>           # inspect one episode
npx tsx scripts/queue-episode.ts <videoId>           # queue full pipeline
npx tsx scripts/reset-stuck-jobs.ts                  # clear jobs stuck from a killed worker
npm run recover-queue -- --queue 5                   # queue 5 more downloads
```
