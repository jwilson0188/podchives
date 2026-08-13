import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EpisodeCatalogView } from "@/components/episodes/EpisodeCatalogView";
import { getEpisodes, getPodcasts } from "@/lib/data";

export const metadata = { title: "Episodes" };

export default async function EpisodesPage() {
  const [episodes, archives] = await Promise.all([
    getEpisodes(),
    getPodcasts(),
  ]);

  const archiveOptions = archives.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <PageHeader
        title="Episodes"
        description="Every video, livestream, and recording — filter by archive or show only fully searchable episodes."
      />

      <Suspense fallback={null}>
        <EpisodeCatalogView
          initialEpisodes={episodes}
          archives={archiveOptions}
        />
      </Suspense>
    </div>
  );
}
