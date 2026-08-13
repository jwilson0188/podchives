"use client";

import { useCallback, useState } from "react";
import {
  buildTimestampUrl,
  formatDate,
  formatTimestamp,
} from "@/lib/utils";

type Props = {
  episodeId: string;
  episodeTitle: string;
  sourceUrl: string;
  podcastName?: string;
  publishDate?: string;
  startTimeSeconds?: number;
  /** Icon-only row for tight card footers. */
  compact?: boolean;
};

export function EpisodeShareActions({
  episodeId,
  episodeTitle,
  sourceUrl,
  podcastName,
  publishDate,
  startTimeSeconds = 0,
  compact = false,
}: Props) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const episodePath = `/episodes/${episodeId}${
    startTimeSeconds > 0 ? `?t=${startTimeSeconds}` : ""
  }`;

  const fullEpisodeUrl = () =>
    `${window.location.origin}${episodePath}`;

  const citation = () => {
    const ts = startTimeSeconds > 0 ? formatTimestamp(startTimeSeconds) : null;
    const when = publishDate ? formatDate(publishDate) : "";
    const src = buildTimestampUrl(sourceUrl, startTimeSeconds);
    const parts = [`"${episodeTitle}"`];
    if (podcastName) parts.push(podcastName);
    if (when) parts.push(when);
    if (ts) parts.push(`@ ${ts}`);
    parts.push(src);
    return parts.join(" — ");
  };

  const flash = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 1500);
  };

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(label);
    } catch {
      flash("Copy failed");
    }
  }, []);

  const onShare = async () => {
    const url = fullEpisodeUrl();
    try {
      if (navigator.share) {
        await navigator.share({
          title: episodeTitle,
          text: podcastName ? `${episodeTitle} · ${podcastName}` : episodeTitle,
          url,
        });
        return;
      }
      await copy(url, "Link copied");
    } catch {
      // user cancelled share sheet
    }
  };

  const btnClass = compact
    ? "p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
    : "btn-secondary text-xs";

  return (
    <div
      className={
        compact
          ? "flex items-center gap-0.5"
          : "flex flex-wrap items-center gap-2"
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {feedback && (
        <span className="text-[0.75rem] text-success mr-1">{feedback}</span>
      )}
      <button
        type="button"
        className={btnClass}
        title="Copy link to this episode"
        aria-label="Copy link"
        onClick={() => copy(fullEpisodeUrl(), "Link copied")}
      >
        <LinkIcon />
        {!compact && "Copy link"}
      </button>
      <button
        type="button"
        className={btnClass}
        title="Copy citation"
        aria-label="Copy citation"
        onClick={() => copy(citation(), "Citation copied")}
      >
        <QuoteIcon />
        {!compact && "Citation"}
      </button>
      <button
        type="button"
        className={btnClass}
        title="Share"
        aria-label="Share"
        onClick={onShare}
      >
        <ShareIcon />
        {!compact && "Share"}
      </button>
      <a
        href={buildTimestampUrl(sourceUrl, startTimeSeconds)}
        target="_blank"
        rel="noopener noreferrer"
        className={btnClass}
        title="Open on source"
        aria-label="Open on source"
      >
        <ExternalIcon />
        {!compact && "Source"}
      </a>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" strokeLinecap="round" />
      <polyline points="16,6 12,2 8,6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="2" x2="12" y2="15" strokeLinecap="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" />
      <polyline points="15,3 21,3 21,9" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" />
    </svg>
  );
}
