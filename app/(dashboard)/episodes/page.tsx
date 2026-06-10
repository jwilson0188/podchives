import { PageHeader } from "@/components/ui/PageHeader";
import { EpisodeCatalogTable } from "@/components/episodes/EpisodeCatalogTable";
import { getEpisodes } from "@/lib/data";

export const metadata = { title: "Episodes" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: { archive?: string; status?: string };
}) {
  const episodes = await getEpisodes({
    archiveId: searchParams.archive,
    status: searchParams.status as
      | "searchable"
      | "failed"
      | "processing"
      | undefined,
  });

  return (
    <div>
      <PageHeader
        eyebrow="library // catalog"
        title="Episodes"
        description="Every video, livestream, and recording — across every connected source."
      />

      <EpisodeCatalogTable episodes={episodes} />
    </div>
  );
}
