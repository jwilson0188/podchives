import type { SourceType } from "./constants";

const RSS_URL_PATTERNS = [
  /\.rss(\?|$)/i,
  /\/podcast\.rss/i,
  /omnycontent\.com/i,
  /feeds\.megaphone\.fm/i,
  /feeds\.simplecast\.com/i,
  /rss\.art19\.com/i,
  /anchor\.fm\/.*\/pod/i,
  /podcast\.google\.com/i,
  /feeds\.blubrry\.com/i,
  /feeds\.transistor\.fm/i,
];

export function isRssFeedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu")) return false;
    const haystack = url.toLowerCase();
    return RSS_URL_PATTERNS.some((re) => re.test(haystack));
  } catch {
    return false;
  }
}

export function detectYouTubeSourceType(url: string): SourceType {
  try {
    const u = new URL(url);
    if (u.searchParams.get("list")) return "youtube_playlist";
    if (u.pathname.startsWith("/playlist")) return "youtube_playlist";
    if (
      u.pathname.startsWith("/watch") ||
      u.hostname.includes("youtu.be") ||
      u.pathname.startsWith("/shorts/") ||
      u.pathname.startsWith("/live/")
    ) {
      return "youtube_video";
    }
    return "youtube_channel";
  } catch {
    return "youtube_channel";
  }
}

export function detectSourceType(url: string): SourceType {
  if (isRssFeedUrl(url)) return "rss";
  return detectYouTubeSourceType(url);
}

export function deriveNameFromRssUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("omnycontent")) return "Podcast RSS";
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && last !== "podcast.rss") {
      return last.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    // ignore
  }
  return "RSS podcast";
}
