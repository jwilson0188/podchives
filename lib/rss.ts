/**
 * RSS / podcast feed ingestion.
 *
 * Parses standard podcast RSS (iTunes, Omny, Megaphone, etc.) without an
 * external XML dependency — feeds are predictable enough for targeted extraction.
 */
import { downloadToFile, ensureStorageDirs, localPath } from "./storage";
import fs from "node:fs";
import path from "node:path";

export type RssEpisode = {
  externalId: string;
  title: string;
  audioUrl: string;
  pageUrl: string;
  publishDate: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  episodeNumber: number | null;
  transcriptUrl: string | null;
};

export type RssFeed = {
  title: string;
  description: string | null;
  imageUrl: string | null;
  link: string | null;
  items: RssEpisode[];
};

const FETCH_HEADERS = {
  "User-Agent": "Podchives/1.0 (+https://github.com/jwilson0188/podchives)",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
};

/** Omny/iHeart RSS for Nightcap (Shannon Sharpe & Ochocinco). */
export const NIGHTCAP_RSS_URL =
  "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/6ced0da2-f257-4234-bf7c-b07601488685/99f1543b-ae3c-4f45-90f2-b076014995d9/podcast.rss";

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripCdata(value: string): string {
  const m = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return decodeXmlEntities((m ? m[1] : value).trim());
}

function firstTagContent(block: string, tag: string): string | null {
  const escaped = tag.replace(":", "\\:");
  const re = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
    "i",
  );
  const m = block.match(re);
  return m ? stripCdata(m[1]!) : null;
}

function attrValue(block: string, tag: string, attr: string): string | null {
  const escapedTag = tag.replace(":", "\\:");
  const re = new RegExp(
    `<${escapedTag}[^>]*\\s${attr}=["']([^"']*)["']`,
    "i",
  );
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]!) : null;
}

/** Prefer WebVTT from podcast:transcript tags (Omny, Podcast Index). */
function parseTranscriptUrl(itemXml: string): string | null {
  const tags = itemXml.match(/<podcast:transcript\b[^>]*>/gi) ?? [];
  const candidates = tags
    .map((tag) => ({
      url: attrValue(tag, "podcast:transcript", "url"),
      type: (attrValue(tag, "podcast:transcript", "type") ?? "").toLowerCase(),
    }))
    .filter((t): t is { url: string; type: string } => Boolean(t.url));

  const vtt = candidates.find(
    (t) =>
      t.type.includes("vtt") ||
      t.url.toLowerCase().includes("webvtt") ||
      t.url.toLowerCase().includes("format=vtt"),
  );
  if (vtt) return vtt.url;

  const srt = candidates.find(
    (t) =>
      t.type.includes("srt") ||
      t.url.toLowerCase().includes("subrip") ||
      t.url.toLowerCase().includes("format=srt"),
  );
  return srt?.url ?? candidates[0]?.url ?? null;
}

function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  return null;
}

function parseRssDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function splitItems(xml: string): string[] {
  return xml.split(/<item\b/i).slice(1).map((chunk) => chunk.split(/<\/item>/i)[0] ?? chunk);
}

function parseEpisodeItem(itemXml: string): RssEpisode | null {
  const title =
    firstTagContent(itemXml, "title") ??
    firstTagContent(itemXml, "itunes:title");
  const audioUrl =
    attrValue(itemXml, "enclosure", "url") ??
    attrValue(itemXml, "media:content", "url");
  if (!title || !audioUrl) return null;

  const guid =
    firstTagContent(itemXml, "guid") ??
    attrValue(itemXml, "omny:clipId", "clipId");
  const externalId = (guid ?? audioUrl).trim();
  if (!externalId) return null;

  const thumbnailUrl =
    attrValue(itemXml, "itunes:image", "href") ??
    attrValue(itemXml, "media:content", "url") ??
    null;

  const episodeNumberRaw = firstTagContent(itemXml, "itunes:episode");
  const episodeNumber = episodeNumberRaw
    ? Number.parseInt(episodeNumberRaw, 10)
    : null;

  return {
    externalId,
    title,
    audioUrl,
    pageUrl:
      firstTagContent(itemXml, "link") ??
      attrValue(itemXml, "media:content", "url") ??
      audioUrl,
    publishDate: parseRssDate(firstTagContent(itemXml, "pubDate")),
    durationSeconds: parseDuration(
      firstTagContent(itemXml, "itunes:duration"),
    ),
    thumbnailUrl:
      thumbnailUrl && !thumbnailUrl.endsWith(".mp3") ? thumbnailUrl : null,
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : null,
    transcriptUrl: parseTranscriptUrl(itemXml),
  };
}

function parseFeedXml(xml: string): RssFeed {
  const channelMatch = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i);
  const channel = channelMatch?.[1] ?? xml;

  const title = firstTagContent(channel, "title") ?? "RSS podcast";
  const description =
    firstTagContent(channel, "description") ??
    firstTagContent(channel, "itunes:summary");
  const imageUrl =
    attrValue(channel, "itunes:image", "href") ??
    (() => {
      const imageBlock = channel.match(/<image\b[^>]*>([\s\S]*?)<\/image>/i)?.[1];
      return imageBlock ? firstTagContent(imageBlock, "url") : null;
    })();
  const link = firstTagContent(channel, "link");

  const items = splitItems(xml)
    .map(parseEpisodeItem)
    .filter((item): item is RssEpisode => item !== null);

  return {
    title,
    description,
    imageUrl,
    link,
    items,
  };
}

function findNextPageUrl(xml: string): string | null {
  const links = xml.match(/<atom:link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = attrValue(tag, "atom:link", "rel");
    if (rel !== "next") continue;
    return attrValue(tag, "atom:link", "href");
  }
  return null;
}

export async function fetchRssFeed(feedUrl: string): Promise<RssFeed> {
  const pages: string[] = [];
  let nextUrl: string | null = feedUrl;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: FETCH_HEADERS });
    if (!res.ok) {
      throw new Error(
        `RSS fetch failed: ${res.status} ${res.statusText} — ${nextUrl}`,
      );
    }
    const xml = await res.text();
    pages.push(xml);
    nextUrl = findNextPageUrl(xml);
    if (nextUrl && pages.length > 50) {
      console.warn(`[rss] stopping pagination after 50 pages for ${feedUrl}`);
      break;
    }
  }

  const merged = pages.reduce<RssFeed>(
    (acc, xml) => {
      const page = parseFeedXml(xml);
      if (!acc.title) {
        acc.title = page.title;
        acc.description = page.description;
        acc.imageUrl = page.imageUrl;
        acc.link = page.link;
      }
      acc.items.push(...page.items);
      return acc;
    },
    {
      title: "",
      description: null,
      imageUrl: null,
      link: null,
      items: [],
    },
  );

  const seen = new Set<string>();
  merged.items = merged.items.filter((item) => {
    if (seen.has(item.externalId)) return false;
    seen.add(item.externalId);
    return true;
  });

  return merged;
}

export function buildRssEpisodeMetadata(episode: RssEpisode) {
  return {
    externalId: episode.externalId,
    episodeTitle: episode.title,
    sourceUrl: episode.audioUrl,
    sourcePlatform: "rss" as const,
    publishDate: episode.publishDate ? new Date(episode.publishDate) : null,
    durationSeconds: episode.durationSeconds,
    thumbnailOriginalUrl: episode.thumbnailUrl,
    transcriptOriginalUrl: episode.transcriptUrl,
    episodeNumber: episode.episodeNumber,
  };
}

/**
 * Download a podcast enclosure (usually mp3) to local storage.
 */
export async function downloadRssAudio(
  episodeId: string,
  audioUrl: string,
  onProgress?: (percent: number) => void | Promise<void>,
): Promise<string> {
  ensureStorageDirs();
  const target = localPath("audio", `${episodeId}.mp3`);
  if (fs.existsSync(target)) return target;

  const res = await fetch(audioUrl, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(
      `RSS audio download failed: ${res.status} ${res.statusText}`,
    );
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body) {
    await downloadToFile(audioUrl, target);
    return target;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const file = fs.createWriteStream(target);
  const reader = res.body.getReader();
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      file.write(Buffer.from(value));
      if (total > 0 && onProgress) {
        const pct = Math.min(99, Math.round((received / total) * 100));
        await Promise.resolve(onProgress(pct));
      }
    }
  } finally {
    file.end();
  }

  if (!fs.existsSync(target)) {
    throw new Error(`Expected audio file at ${target}, not found.`);
  }
  return target;
}
