import type { DownloadManagerSnapshot, DownloadView, EpisodeView, SourceView } from "./data";

export async function loadDownloadSnapshot(read: {
  downloads: () => Promise<DownloadView[]>;
  sources: () => Promise<SourceView[]>;
  episodes: (ids: string[]) => Promise<EpisodeView[]>;
}, demo: boolean): Promise<DownloadManagerSnapshot> {
  try {
    const [downloads, sources] = await Promise.all([read.downloads(), read.sources()]);
    const ids = [...new Set(downloads.map((download) => download.episodeId))];
    const episodes = ids.length ? await read.episodes(ids) : [];
    return { downloads, episodes, sources, demo };
  } catch {
    return { downloads: [], episodes: [], sources: [], demo, error: "Download Manager is temporarily unavailable." };
  }
}
