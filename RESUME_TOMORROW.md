# Resume here — Podchives production checklist

Last updated after sources/DB pool troubleshooting. The stack is deployed; **fix Vercel
`DATABASE_URL` (port 6543)** before trusting the dashboard — sources and stats can look
empty when the session pooler (5432) is saturated. After that, flip auto-sync when ready
for the full backfill.

## Where things stand

### Deployed & working

- [x] **GitHub** — `jwilson0188/podchives` (private), branch `main`
- [x] **Vercel** — web app live, auto-deploy on push
- [x] **Render** — Docker worker (`Dockerfile`: ffmpeg, yt-dlp, Deno), auto-deploy on push
- [x] **Supabase** — Postgres + pgvector; shared by Vercel + Render
- [x] **Pipeline** — download → transcribe → embed → index (validated on at least one episode)
- [x] **Thumbnails** — served from YouTube CDN (not worker-local paths)
- [x] **Worker concurrency** — up to 10 jobs in parallel (`WORKER_CONCURRENCY=10`)



### UI / creator features (recent)

- [x] **Dashboard cockpit** — brand hero, coverage ring, pipeline funnel, quick actions
- [x] **Clip of the week** — top hit from recent search (or latest searchable moment)
- [x] **Share/export** — copy link, citation, native share on episode cards + detail
- [x] **Auto-sync** — per-source toggle (Sources) + master switch (Dashboard)
- [x] **Remove source** — trash icon on each source card (cascades episodes + archive)
- [x] **Per-archive search** — filter dropdown on Search page (`?archive=<id>`)
- [x] **Real usage metering** — embedding tokens + audio bytes measured; live dashboard card
- [x] **Mobile** — bottom tab nav, collapsible filters, touch-friendly layout
- [x] **No full-page refresh on navigation** — targeted live polling + client caches (see below)
- [x] **Episodes filter** — "Fully searchable" + archive dropdown on `/episodes`
- [x] **Mobile add source** — form first on Sources page; `/sources#add-source` deep link
- [x] **Stop sync** — per-source button on Download Manager (`POST /api/sources/[id]/stop-sync`)
- [x] **Sources recovery (code)** — retry/backfill when list queries fail; client fetch via `/api/sources`; dashboard stash merge (commit `1c61442`)



### Not done yet / needs your action

- [ ] **BLOCKER: Vercel `DATABASE_URL` → port 6543** — see **Fix sources / DATABASE_URL** below; until this is set and redeployed, dashboard/Sources may show empty even though data exists in Supabase
- [ ] **Verify sources appear** — after Vercel env fix: hard-refresh Dashboard, `/sources`, Download Manager; should list connected YouTube sources
- [ ] **Flip auto-sync ON** when ready for full backfill (~$50–65 one-time Whisper cost for ~186 episodes)
- [ ] **Vercel** `BETA_PASSWORD` — set to `podchives26` in Vercel dashboard if not done yet (local `.env` already updated; redeploy required)
- [ ] **Full backfill smoke test** — confirm coverage ring climbs and search works across many episodes
- [ ] **Cookie refresh** — re-export `cookies.txt` when YouTube downloads start 403-ing
- [ ] **Clip Engine (v1)** — see spec below; next major feature build
- [ ] **Caption Engine (v1)** — see spec below; pairs with Clip Engine for social export

---



## Architecture (quick reference)


| Piece    | Where                       | Notes                                                                 |
| -------- | --------------------------- | --------------------------------------------------------------------- |
| Web app  | Vercel                      | Next.js 14, `NEXT_PUBLIC_DEMO_MODE=false`                             |
| Worker   | Render (`podchives-worker`) | Docker, always-on, polls queue every ~5s                              |
| Database | Supabase                    | **Vercel → 6543** (transaction pooler); **Render/local → 5432** OK   |
| Cookies  | Render Secret File          | `/etc/secrets/cookies.txt` (read-only mount; worker copies to `/tmp`) |
| AI       | OpenAI                      | Whisper + text-embedding-3-small                                      |


---



## Environment variables



### Vercel (web app)


| Key                     | Purpose                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`          | Supabase **transaction pooler** (port **6543**) + `?pgbouncer=true` — see note below |
| `OPENAI_API_KEY`        | Search/embeddings if used server-side                                                |
| `NEXT_PUBLIC_DEMO_MODE` | `false` for live DB                                                                  |
| `BETA_PASSWORD`         | Gate the app (`podchives26` — rotate in dashboard + redeploy)                        |




### Render (worker)


| Key                          | Value / notes                                                       |
| ---------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`               | Supabase **session pooler port 5432** (long-lived worker — not 6543) |
| `OPENAI_API_KEY`             | Same as Vercel                                                      |
| `NEXT_PUBLIC_DEMO_MODE`      | `false`                                                             |
| `YOUTUBE_COOKIES_FILE`       | `/etc/secrets/cookies.txt` (from `render.yaml`)                     |
| `WORKER_CONCURRENCY`         | `10`                                                                |
| `AUTO_SYNC_ENABLED`          | `true` (global kill-switch; per-source toggles control actual sync) |
| `AUTO_SYNC_INTERVAL_MINUTES` | `360` (6h)                                                          |


**Secret file:** `cookies.txt` — export from Chrome while logged into YouTube (extension: "Get cookies.txt LOCALLY"). Never commit.

**Vercel** `DATABASE_URL`**:** Use Supabase **Transaction pooler** (port **6543**), not session pooler (5432). Session mode caps at ~15 connections — `next build` and serverless lambdas will hit `EMAXCONNSESSION` and list queries (`getSources`) fail while count queries still succeed → **stats show episodes but Sources panel is empty**. Code in `lib/db.ts` auto-appends `pgbouncer=true` and `connection_limit=1` when port is 6543.

**Render worker** `DATABASE_URL`**:** Keep **5432** (direct/session pooler). One long-lived process; no serverless burst.

**Local `.env`** `DATABASE_URL`**:** Currently **5432** — fine for solo dev. Optional: switch to **6543** to match production. Not required if local dev works.

---

## Fix sources / DATABASE_URL (do this first)

Symptoms: Dashboard shows episode stats but **Sources empty**; `/sources` says "No sources connected"; Download Manager shows 0 sources — **data is still in Supabase**, the web app is failing to read lists under pool pressure.

### Step 1 — Get the right connection string (Supabase)

**Easiest fix:** Copy `DATABASE_URL` from your local `.env` (it already works) and **only change the port** `5432` → `6543`. Keep the same username and password.

1. Supabase → **Project Settings** → **Database** → **Connection string**
2. Choose **URI** under **Transaction pooler** (not Session)
3. Port must be **6543**, host like `aws-1-us-east-1.pooler.supabase.com`
4. Copy the string; replace `[YOUR-PASSWORD]` with your DB password (URL-encode special chars: `@` → `%40`, etc.)

**Username must include your project ref** — not plain `postgres`:

| Wrong (auth fails) | Right |
| ------------------ | ----- |
| `postgresql://postgres:password@...pooler...:6543/postgres` | `postgresql://postgres.tghyraygdkbsjvlbrgyb:password@...pooler...:6543/postgres` |

If Prisma says *"credentials for `postgres` are not valid"*, Vercel has the **wrong username** (missing `.tghyraygdkbsjvlbrgyb`) or wrong password / literal `[YOUR-PASSWORD]`.

Example shape (password is yours):

```
postgresql://postgres.tghyraygdkbsjvlbrgyb:YOUR_PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

### Step 2 — Set in Vercel

1. Vercel → your project → **Settings** → **Environment Variables**
2. Edit **`DATABASE_URL`** for **Production** (and Preview if you use it)
3. Paste the **6543** URL. Optional but fine to append explicitly:

```
?pgbouncer=true
```

Full example:

```
postgresql://postgres.tghyraygdkbsjvlbrgyb:YOUR_PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

4. **Save** → **Deployments** → **Redeploy** latest (env changes do not apply until redeploy)

### Step 3 — Verify

1. Hard refresh (Cmd+Shift+R) on Dashboard, `/sources`, Download Manager
2. Sources should list your YouTube channels/playlists
3. If still empty: Vercel → **Logs** → filter for `[data] getSources failed` or `EMAXCONNSESSION`

### What NOT to do

| Wrong | Why |
| ----- | --- |
| Port **5432** on Vercel | Session pooler; ~15 conn cap; list queries fail intermittently |
| Same 6543 URL on Render worker | Unnecessary; worker wants stable 5432 session |
| Expect fix without redeploy | Vercel only reads env at deploy time |

### Code already shipped (partial mitigation)

Even with wrong Vercel URL, these help but **do not replace 6543**:

| Fix | File |
| --- | ---- |
| Retry `getSources` / backfill in cockpit | `lib/data.ts` — `getSourcesWithRetry`, `getCockpitSummary` backfill |
| Client recovery fetch | `components/sources/SourcesList.tsx` → `GET /api/sources` |
| Dashboard stash when sources drop | `lib/dashboardCache.ts`, `components/dashboard/DashboardShell.tsx` |
| Auto `pgbouncer=true` on 6543 | `lib/db.ts` |

---



## Day-one workflow (after auto-sync is on)

1. Open Vercel URL → log in with `BETA_PASSWORD`.
2. **Dashboard** → flip **Auto-sync ON** (or toggle per source on **Sources**).
3. Watch **Live processing** + **Usage** card tick up (refreshes every 15s, DB-only — no extra OpenAI cost).
4. **Archive pipeline** — Ingested → Transcribed → Searchable should climb over hours/days.
5. **Search** — try a phrase; use archive filter to scope to one show.
6. **Clip of the week** — surfaces once you have searches + searchable segments.

To pause backfill: turn **Auto-sync OFF** on Dashboard or per source. In-flight jobs finish; no new re-syncs queue.

---



## Costs (approximate)


| Item                       | Estimate                                  |
| -------------------------- | ----------------------------------------- |
| Render Starter worker      | ~$7/mo                                    |
| Vercel                     | Free tier likely sufficient for solo beta |
| Supabase                   | Free tier                                 |
| OpenAI backfill (~186 eps) | ~$50–65 one-time (Whisper-heavy)          |
| Ongoing new uploads        | ~$0.30 per long episode                   |


Usage page and per-episode **Compute & cost** cards show measured spend (not guesses).

---



## Troubleshooting


| Symptom                                 | Fix                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Downloads fail with 403                 | Re-export `cookies.txt` → update Render Secret File → redeploy worker                           |
| `Requested format is not available`     | Worker needs Deno + `player_client=default` (already in Dockerfile + `lib/youtube.ts`)          |
| Jobs stuck `running`                    | `npx tsx scripts/reset-stuck-jobs.ts`                                                           |
| `prisma db push` fails (pool saturated) | Use transaction pooler (port 6543) or run one-off migration scripts                             |
| Vercel build: `max clients reached`     | Vercel `DATABASE_URL` → port **6543** + `?pgbouncer=true`; dashboard layout is `force-dynamic`  |
| Thumbnails broken                       | Should be fixed — uses `i.ytimg.com` URLs, not worker disk paths                                |
| Auto-sync not running                   | Per-source `autoSync` must be ON **and** `AUTO_SYNC_ENABLED=true` on Render                     |
| Dashboard stats OK but **Sources empty** | **Vercel `DATABASE_URL` must be port 6543** — see **Fix sources / DATABASE_URL** above |
| Dashboard resets to 0% / fully empty       | Transient pool blip — client recovery via `/api/dashboard/cockpit`; check 6543 on Vercel        |
| `/sources` shows 0 connected               | Same as above; page also retries via `/api/sources` after SSR empty                             |
| `Authentication failed` / invalid credentials | Wrong username (`postgres` vs `postgres.tghyraygdkbsjvlbrgyb`) or wrong password on Vercel — copy local `.env`, change port to 6543 only |
| Vercel build: `max clients reached`      | Vercel `DATABASE_URL` → 6543; dashboard layout is `force-dynamic`                             |
| Back nav repopulates whole archive       | Episodes use in-memory catalog cache; dashboard uses `DashboardShell` stash                     |


---



## Navigation & live data (no full server refresh)

**Problem:** Navigating away and back (or live polling) caused the whole app to re-fetch from
the server. Dashboard sometimes flashed to **0% searchable / no sources** even though the
archive was intact — caused by transient Supabase pool errors returning empty fallbacks from
`getCockpitSummary()`, plus `router.refresh()` and `AutoRefresh` re-running every server component.

**Fix (shipped):**


| Area             | Approach                                                                                          | Key files                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Live metrics     | Poll small JSON APIs only — never `router.refresh()` the page                                     | `hooks/useLivePoll.ts`, `/api/dashboard/live`, `/api/usage`                                     |
| Dashboard        | Stash + merge; retry cockpit; recover when sources missing (`cockpitSourcesMissing`)              | `lib/dashboardCache.ts`, `components/dashboard/DashboardShell.tsx`, `/api/dashboard/cockpit`    |
| Sources list     | SSR retry + client `/api/sources` fallback                                                        | `lib/data.ts` (`getSourcesWithRetry`), `components/sources/SourcesList.tsx`                     |
| Episodes catalog | In-memory cache + scroll restore on back; URL filters (`?status=searchable`)                      | `lib/episodeCatalogCache.ts`, `components/episodes/EpisodeCatalogView.tsx`                      |
| Browse pages     | Removed `force-dynamic` / `revalidate = 0` from Episodes, Search, Archives, Sources               | respective `app/(dashboard)/*/page.tsx`                                                         |
| Router cache     | `staleTimes` in Next config (60s dynamic)                                                         | `next.config.mjs`                                                                               |
| Auto-sync toggle | No longer calls `router.refresh()` after toggle                                                   | `components/dashboard/AutoSyncButton.tsx`                                                       |


**Removed:** `components/ui/AutoRefresh.tsx` (was calling `router.refresh()` every 15s).

**If sources disappear but episode counts look right:** Vercel is almost certainly still on port
**5432**. Fix env → redeploy (see **Fix sources / DATABASE_URL**). Partial SSR (stats OK, lists
empty) is the signature of session-pool saturation, not deleted data.

**Do not re-introduce:** page-level `AutoRefresh`, blanket `router.refresh()` after mutations, or
`revalidate = 0` on catalog/browse routes unless you also add client-side stash logic.

---



## Handy local commands

```bash
npm run dev                    # web app locally
npm run worker                 # local worker (don't run alongside Render long-term)
npx tsx scripts/check-episode.ts <videoId>
npx tsx scripts/queue-episode.ts <videoId> --from download
npx tsx scripts/reset-stuck-jobs.ts
npm run recover-queue -- --queue 5
```

---



## Next feature: The Clip Engine

**Status:** Not built — spec for next session.  
**Builds on:** Clip of the week, search results, share/export, transcript segments.

### What it is

The Clip Engine turns search hits into **durable, organized clips** creators can reuse —
not one-off copies from search. Find a moment → save it → tag it → export it for
newsletter, social, or show notes.

Today you can share a timestamp once. The engine makes that moment **persistent and
workflow-ready**.

### Already in the app (Clip Engine v0)


| Piece                        | Where                              | Gap                                    |
| ---------------------------- | ---------------------------------- | -------------------------------------- |
| Clip of the week             | Dashboard                          | Auto-surface only; not saveable        |
| Copy citation / link / share | Search results, episode cards      | Ephemeral — nothing saved              |
| Timestamp URLs               | `buildTimestampUrl`, episode `?t=` | Works; clips don't persist             |
| Transcript segments          | DB (`transcript_segments`)         | Source material; no "saved clip" layer |




### Clip Engine v1 — scope

**Core loop:** Search → Save clip → View in library → Export / share again.

1. **Save clip** — button on search results + transcript viewer (bookmark icon)
2. **Clips library** — new nav page `/clips` — all saved moments, sortable by date/show
3. **Collections** — optional folders: "Newsletter", "Shorts ideas", "Best quotes"
4. **Clip card** — quote, episode, timestamp, thumbnail, one-click re-export
5. **Dashboard widget** — "Recent clips" alongside clip of the week



### Data model (sketch)

```
saved_clips
  id, user_id (future), episode_id, segment_id (nullable)
  start_time_seconds, end_time_seconds
  transcript_text, note (optional creator memo)
  collection_id (nullable), created_at

clip_collections
  id, name, slug, color?, created_at
```

No new worker jobs — clips reference existing indexed segments. MVP can skip auth
(single-user beta) and use one implicit "library".

### UI surfaces


| Surface            | Action                                       |
| ------------------ | -------------------------------------------- |
| Search result card | **Save clip** next to Copy citation          |
| Episode transcript | Save any highlighted segment                 |
| `/clips`           | Grid/list of saved clips + collection filter |
| Dashboard          | Recent clips (last 5) + link to library      |
| Clip detail        | Full quote, open episode, export formats     |




### Export formats (v1)

- **Citation** — existing format (already implemented)
- **Link** — `podchives.vercel.app/episodes/{id}?t={seconds}`
- **Social blurb** — quote + episode title + link (plain text)
- **Newsletter block** — markdown quote block + attribution (v1.1)
- **Subtitles (SRT/VTT)** — via Caption Engine for saved clip range



### Implementation order

1. [ ] Prisma schema + migration (`saved_clips`, `clip_collections`)
2. [ ] API: `POST/GET/DELETE /api/clips`, `POST/GET /api/clips/collections`
3. [ ] `SaveClipButton` on `SearchResultCard` + `TranscriptViewer`
4. [ ] `/clips` page — clip library with collection sidebar
5. [ ] Dashboard "Recent clips" strip
6. [ ] Wire clip of the week → "Save to library" CTA



### Out of scope for v1

- AI-suggested clips / auto-chapter detection
- Video file export (would need ffmpeg cut on worker)
- Multi-user / team permissions
- Public clip sharing pages



### Why this next

Highest daily value for creators after search works: **search finds it, Clip Engine
keeps it**. Closes the loop from archive → moment → reusable asset.

---



## Next feature: The Caption Engine

**Status:** Not built — spec for next session.  
**Builds on:** Whisper transcript segments, episode player, Clip Engine (when built).

### What it is

The Caption Engine turns indexed transcript segments into **platform-ready subtitles**
— timed, readable, exportable. Creators repurpose long episodes into Shorts, Reels,
and clips; captions are non-negotiable for reach and accessibility.

Today you can read and seek the transcript. The engine makes those words **exportable
as SRT/VTT and previewable as on-screen captions** for any moment or full episode.

### Already in the app (Caption Engine v0)


| Piece                          | Where                                  | Gap                                     |
| ------------------------------ | -------------------------------------- | --------------------------------------- |
| Timed segments                 | `transcript_segments` (start/end/text) | No subtitle export                      |
| Transcript viewer              | Episode detail                         | Read-only; no caption styling           |
| Whisper pipeline               | Worker transcription step              | Full-episode only; no clip-range helper |
| `youtube_captions` source type | Schema constant                        | Not wired as ingest path                |




### Caption Engine v1 — scope

**Core loop:** Pick a moment (or episode) → tune caption lines → preview → export.

1. **Export subtitles** — download **SRT** and **WebVTT** for full episode or saved clip range
2. **Clip captions** — when a clip is saved (Clip Engine), auto-generate captions for that window
3. **Caption preview** — styled overlay mock on episode player (Shorts-style: bold, centered, 2 lines max)
4. **Line editor** — split/merge segment lines, max chars per line, platform presets
5. **Copy formats** — plain timed text, SRT snippet, or social caption block (text only)



### Platform presets (v1)


| Preset         | Max chars/line | Lines | Notes                      |
| -------------- | -------------- | ----- | -------------------------- |
| YouTube Shorts | 32             | 2     | Center-bottom safe zone    |
| TikTok / Reels | 28             | 2     | Slightly tighter           |
| Full episode   | 42             | 2     | Standard SRT for re-upload |


Presets are formatting rules only — no API calls.

### Data model (sketch)

```
caption_exports (optional audit log)
  id, episode_id, clip_id (nullable)
  start_time_seconds, end_time_seconds
  format (srt | vtt | plain)
  preset, file_path or inline_text
  created_at

caption_overrides (optional v1.1)
  id, segment_id or clip_id
  custom_text, line_breaks (json)
```

MVP can generate SRT/VTT **on the fly** from segments + clip range — no DB table
required until you want saved edits.

### UI surfaces


| Surface                  | Action                                           |
| ------------------------ | ------------------------------------------------ |
| Episode detail           | **Export captions** (SRT / VTT) for full episode |
| Transcript viewer        | Select segment range → preview + export          |
| Saved clip (Clip Engine) | **Download captions** for clip window            |
| Caption preview modal    | Styled overlay on thumbnail/player frame         |
| `/clips` clip card       | Caption export alongside share/citation          |




### Export formats (v1)

- **SRT** — universal; Premiere, DaVinci, YouTube upload
- **WebVTT** — web player + some editors
- **Plain timed text** — `00:01:23 quote here` for paste into editors
- **Social caption block** — quote only, no timestamps (pairs with Clip Engine export)



### Implementation order

1. [ ] `lib/captions.ts` — segment → SRT/VTT formatter, clip-range slice, preset line-wrapping
2. [ ] API: `GET /api/episodes/[id]/captions?format=srt|vtt&start=&end=`
3. [ ] `ExportCaptionsButton` on episode detail + transcript viewer
4. [ ] `CaptionPreview` component — CSS overlay with preset styles
5. [ ] Wire Clip Engine saved clips → caption download for clip range
6. [ ] (v1.1) Simple line editor + optional `caption_overrides` persistence



### Out of scope for v1

- Burned-in video export (ffmpeg caption render on worker)
- Word-level karaoke timing (Whisper word timestamps)
- Auto-translation / multi-language
- YouTube auto-upload of caption tracks



### How Clip Engine + Caption Engine fit together

```
Search → Save clip (Clip Engine) → Export citation + SRT (Caption Engine) → Post
```

Clip Engine owns **which moment**. Caption Engine owns **how it reads on screen**.
Build Clip Engine first; Caption Engine layers on without new worker jobs.

### Why this matters

Creators don't just need to find quotes — they need **subtitles ready for editors
and platforms**. Whisper already paid for the timing; Caption Engine is mostly
formatting and export UX.

---



## Other possible features (later)

- Show notes / episode recap generator
- "Episode ready" email/Slack notifications
- Public searchable archive page for fans
- Semantic / "ask your archive" search (Phase 5)

---



## One-line status

**Production is live — set Vercel `DATABASE_URL` to Supabase port 6543 + redeploy, confirm sources show, then flip auto-sync for backfill. Next builds: Clip Engine + Caption Engine.**