"use client";

import Link from "next/link";
import { useState } from "react";
import type { FeaturedClip } from "@/lib/data";
import {
  buildTimestampUrl,
  formatDate,
  formatTimestamp,
  highlight,
} from "@/lib/utils";

export function ClipOfTheWeek({ clip }: { clip: FeaturedClip }) {
  const [copied, setCopied] = useState(false);
  const tsUrl = buildTimestampUrl(clip.sourceUrl, clip.startTimeSeconds);
  const episodeHref = `/episodes/${clip.episodeId}?t=${clip.startTimeSeconds}`;

  const citation = `"${clip.transcriptText.trim()}" — ${clip.podcastName}, ${
    clip.episodeTitle
  }${clip.episodeNumber ? ` (Ep. ${clip.episodeNumber})` : ""}, ${formatDate(
    clip.publishDate,
  )} @ ${formatTimestamp(clip.startTimeSeconds)} — ${tsUrl}`;

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignored
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${episodeHref}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Clip from ${clip.episodeTitle}`,
          text: clip.transcriptText.slice(0, 120) + "…",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // cancelled
    }
  };

  return (
    <section className="card overflow-hidden mb-6">
      <div className="p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="w-full sm:w-36 aspect-video sm:aspect-square rounded-lg overflow-hidden border border-border flex-shrink-0 bg-bg-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={clip.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[0.8125rem] font-medium text-ink-secondary">
                Clip of the week
              </span>
              <span className="text-[0.8125rem] text-ink-muted">
                matched &ldquo;{clip.searchQuery}&rdquo;
              </span>
            </div>

            <h2 className="text-[1.0625rem] font-semibold tracking-[-0.013em] text-ink">
              {clip.episodeTitle}
            </h2>
            <p className="text-[0.8125rem] text-ink-muted mt-1">
              {clip.podcastName} · {formatDate(clip.publishDate)} ·{" "}
              {formatTimestamp(clip.startTimeSeconds)}
            </p>

            <blockquote className="mt-3 border-l-2 border-line-strong pl-4 py-0.5">
              <p
                className="text-[0.9375rem] leading-relaxed text-ink-secondary line-clamp-4 sm:line-clamp-3"
                dangerouslySetInnerHTML={{
                  __html: highlight(clip.transcriptText, clip.searchQuery),
                }}
              />
            </blockquote>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={episodeHref} className="btn-primary text-xs">
                Open clip
              </Link>
              <a
                href={tsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                Jump to timestamp
              </a>
              <button
                type="button"
                onClick={copyCitation}
                className="btn-secondary text-xs"
              >
                {copied ? "Copied!" : "Copy citation"}
              </button>
              <button
                type="button"
                onClick={share}
                className="btn-secondary text-xs"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
