import { PageHeader } from "@/components/ui/PageHeader";
import { ScrollToHash } from "@/components/ui/ScrollToHash";
import { SourcesList } from "@/components/sources/SourcesList";
import { AddSourceForm } from "@/components/sources/AddSourceForm";
import { getSourcesWithRetry } from "@/lib/data";

export const metadata = { title: "Sources" };

export default async function SourcesPage() {
  const sources = await getSourcesWithRetry();
  return (
    <div>
      <ScrollToHash id="add-source" />
      <PageHeader
        eyebrow="archive // sources"
        title="Sources"
        description="Connect YouTube channels, playlists, or single videos. RSS, manual upload, and Patreon are coming soon."
      />

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        {/* Form first on mobile so the URL field is above the fold */}
        <div className="order-1 lg:order-2 scroll-mt-20" id="add-source">
          <AddSourceForm />
        </div>

        <div className="order-2 lg:order-1">
          <h2 className="text-sm font-semibold tracking-tight mb-3 text-text-muted uppercase tracking-widest text-[11px]">
            Connected ({sources.length})
          </h2>
          <div className="space-y-3 mb-8">
            <SourcesList initial={sources} />
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
