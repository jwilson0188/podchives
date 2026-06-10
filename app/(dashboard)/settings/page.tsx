import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const env = (k: string) => process.env[k];
  const hasKey = (k: string) => Boolean(env(k));

  return (
    <div>
      <PageHeader
        eyebrow="config"
        title="Settings"
        description="Environment, processing mode, overnight scheduler, storage, and theme."
      />

      <div className="space-y-6">
        <Section title="API keys">
          <KeyRow
            name="OPENAI_API_KEY"
            present={hasKey("OPENAI_API_KEY")}
            desc="Used for Whisper transcription and embeddings."
          />
          <KeyRow
            name="DATABASE_URL"
            present={hasKey("DATABASE_URL")}
            desc="Postgres connection string (Supabase or self-hosted)."
          />
          <KeyRow
            name="STORAGE_BUCKET"
            present={hasKey("STORAGE_BUCKET")}
            desc="Object storage for audio files. Local fs is used when empty."
          />
          <KeyRow
            name="YOUTUBE_COOKIES_FILE"
            present={hasKey("YOUTUBE_COOKIES_FILE")}
            desc="Path to a yt-dlp cookies.txt for age/region/auth-locked content."
          />
        </Section>

        <Section title="Processing mode">
          <SettingRow
            label="Mode"
            value={env("PROCESSING_MODE") ?? "local"}
            options={["local", "render-worker", "cloud-run"]}
          />
          <SettingRow
            label="Demo data"
            value={(env("NEXT_PUBLIC_DEMO_MODE") ?? "true").toLowerCase()}
            options={["true", "false"]}
          />
        </Section>

        <Section title="Overnight processing">
          <SettingRow
            label="Enabled"
            value={(env("OVERNIGHT_PROCESSING_ENABLED") ?? "false").toLowerCase()}
            options={["true", "false"]}
          />
          <SettingRow
            label="Start time"
            value={env("OVERNIGHT_START_TIME") ?? "02:00"}
          />
          <SettingRow
            label="Max jobs per run"
            value={env("MAX_JOBS_PER_RUN") ?? "3"}
          />
          <SettingRow
            label="Retry failed jobs"
            value="true"
            options={["true", "false"]}
          />
        </Section>

        <Section title="Storage">
          <SettingRow label="Driver" value="local" options={["local", "supabase", "s3"]} />
          <SettingRow label="Audio path" value="/storage/audio" />
          <SettingRow label="Thumbnail path" value="/storage/thumbnails" />
        </Section>

        <Section title="Theme">
          <SettingRow
            label="Mode"
            value="dark"
            options={["dark"]}
          />
          <SettingRow
            label="Accent"
            value="#FF3D00"
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold tracking-tight mb-3">{title}</h2>
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
  options,
}: {
  label: string;
  value: string;
  options?: string[];
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="text-sm">{label}</div>
      <div className="flex items-center gap-2">
        {options && options.length > 1 ? (
          <select
            className="input w-auto text-sm font-mono py-1 min-w-[140px]"
            defaultValue={value}
            disabled
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <code className="text-sm text-text-primary font-mono">{value}</code>
        )}
      </div>
    </div>
  );
}
