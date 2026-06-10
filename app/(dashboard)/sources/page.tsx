import { PageHeader } from "@/components/ui/PageHeader";
import { SourceCard } from "@/components/sources/SourceCard";
import { AddSourceForm } from "@/components/sources/AddSourceForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSources } from "@/lib/data";

export const metadata = { title: "Sources" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SourcesPage() {
  const sources = await getSources();
  return (
    <div>
      <PageHeader
        eyebrow="archive // sources"
        title="Sources"
        description="Connect YouTube channels, playlists, or single videos. RSS, manual upload, and Patreon are coming soon."
      />

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight mb-3 text-text-muted uppercase tracking-widest text-[11px]">
            Connected ({sources.length})
          </h2>
          <div className="space-y-3 mb-8">
            {sources.length === 0 ? (
              <EmptyState
                title="No sources connected"
                description="Paste a YouTube channel, playlist, or video URL on the right to start your first archive."
              />
            ) : (
              sources.map((s) => <SourceCard key={s.id} source={s} />)
            )}
          </div>

          <h2 className="text-sm font-semibold tracking-tight mb-3 text-text-muted uppercase tracking-widest text-[11px]">
            Coming soon
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <FutureSourceCard
              title="RSS feed"
              desc="Subscribe to any podcast RSS — Apple, Spotify, Substack."
            />
            <FutureSourceCard
              title="Manual upload"
              desc="Upload mp3/wav/mp4 files directly for transcription."
            />
            <FutureSourceCard
              title="Patreon / members"
              desc="Auth-required feeds via cookie or token forwarding."
            />
          </div>
        </div>

        <div>
          <AddSourceForm />
        </div>
      </div>
    </div>
  );
}

function FutureSourceCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="card border-dashed p-4 opacity-70">
      <div className="flex items-center justify-between mb-1">
        <div className="font-semibold">{title}</div>
        <span className="pill bg-bg-elevated text-text-muted border border-border">
          soon
        </span>
      </div>
      <p className="text-xs text-text-muted">{desc}</p>
    </div>
  );
}
