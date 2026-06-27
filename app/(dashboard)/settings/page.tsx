import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const env = (k: string) => process.env[k];
  const hasKey = (k: string) => Boolean(env(k));
  const demoMode = (env("NEXT_PUBLIC_DEMO_MODE") ?? "true").toLowerCase();

  return (
    <div>
      <PageHeader
        eyebrow="config"
        title="Settings"
        description="How this deployment is wired up. Configuration lives in environment variables on Vercel (web) and Render (worker) — this page is read-only."
      />

      <div className="space-y-6">
        <Section
          title="Deployment"
          desc="Where each part of the system actually runs."
        >
          <SettingRow label="Web app" value="Vercel" />
          <SettingRow
            label="Background worker"
            value="Render — Docker, always-on"
            hint="Runs the ingestion → transcription → embedding → indexing pipeline."
          />
          <SettingRow
            label="Database"
            value="Supabase — Postgres + pgvector"
            hint="Shared by the web app and the worker. All durable data lives here."
          />
          <SettingRow
            label="AI"
            value="OpenAI — Whisper + text-embedding-3-small"
          />
        </Section>

        <Section
          title="Environment (this web app)"
          desc="Secrets configured on the web app. The worker keeps its own copy of these on Render."
        >
          <KeyRow
            name="OPENAI_API_KEY"
            present={hasKey("OPENAI_API_KEY")}
            desc="Used for Whisper transcription and embeddings."
          />
          <KeyRow
            name="DATABASE_URL"
            present={hasKey("DATABASE_URL")}
            desc="Postgres connection string (Supabase)."
          />
          <SettingRow
            label="YOUTUBE_COOKIES_FILE"
            value="set on the worker (Render secret file)"
            hint="yt-dlp needs this; it lives with the worker, not the web app, so it correctly shows as absent here."
          />
          <SettingRow
            label="Demo data (NEXT_PUBLIC_DEMO_MODE)"
            value={demoMode}
            hint={
              demoMode === "true"
                ? "Showing mock data — not the live database."
                : "Live mode — reading from the real database."
            }
          />
        </Section>

        <Section
          title="Processing"
          desc="Handled by the background worker, not this web app."
        >
          <SettingRow
            label="Runner"
            value="Render worker — continuous"
            hint="Polls the job queue every ~5s, 24/7. There is no 'local' processing in production."
          />
          <SettingRow label="Concurrency" value="1 job at a time" />
          <SettingRow
            label="Overnight scheduler"
            value="off — not used"
            hint="The worker runs continuously, so the scheduled-window mode is disabled. Failed jobs are retried manually from the Processing Queue."
          />
        </Section>

        <Section
          title="Storage"
          desc="Audio is transient; durable data lives in Postgres."
        >
          <SettingRow
            label="Driver"
            value="local — ephemeral"
            hint="Downloaded audio is written to the worker's disk and wiped on each redeploy. That's fine: transcripts + embeddings persist in Postgres, and playback streams from the original source URL."
          />
          <SettingRow label="Audio path" value="storage/audio" />
          <SettingRow label="Thumbnail path" value="storage/thumbnails" />
          <SettingRow
            label="Object storage (STORAGE_BUCKET)"
            value={hasKey("STORAGE_BUCKET") ? "configured" : "not configured"}
            hint="Optional Supabase Storage / S3 for durable audio. Not required for search."
          />
        </Section>

        <Section title="Theme">
          <SettingRow label="Mode" value="dark" />
          <SettingRow label="Accent" value="#FF3D00" />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold tracking-tight">{title}</h2>
      {desc ? (
        <p className="text-xs text-text-muted mt-0.5 mb-3">{desc}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function KeyRow({
  name,
  present,
  desc,
}: {
  name: string;
  present: boolean;
  desc: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <div className="font-mono text-sm">{name}</div>
        <div className="text-xs text-text-muted">{desc}</div>
      </div>
      {present ? (
        <span className="pill bg-success-muted text-success">
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m5 12 5 5 9-11" strokeLinecap="round" />
          </svg>
          set
        </span>
      ) : (
        <span className="pill bg-warn-muted text-warn">missing</span>
      )}
    </div>
  );
}

function SettingRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between py-3 gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? (
          <div className="text-xs text-text-muted mt-0.5">{hint}</div>
        ) : null}
      </div>
      <code className="text-sm text-text-primary font-mono text-right shrink-0">
        {value}
      </code>
    </div>
  );
}
