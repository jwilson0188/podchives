"use client";

import Link from "next/link";
import { useState } from "react";
import type { DemoSearchResult } from "@/lib/demoData";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import {
  buildTimestampUrl,
  formatDate,
  formatTimestamp,
  highlight,
} from "@/lib/utils";

export function SearchResultCard({
  result,
  query,
}: {
  result: DemoSearchResult;
  query: string;
}) {
  const [copied, setCopied] = useState(false);
  const tsUrl = buildTimestampUrl(result.sourceUrl, result.startTimeSeconds);
  const episodeHref = `/episodes/${result.episodeId}?t=${result.startTimeSeconds}`;

  const citation = `"${result.transcriptText.trim()}" — ${result.podcastName}, ${
    result.episodeTitle
  }${result.episodeNumber ? ` (Ep. ${result.episodeNumber})` : ""}, ${formatDate(
    result.publishDate,
  )} @ ${formatTimestamp(result.startTimeSeconds)} — ${tsUrl}`;

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignored
    }
  };

  return (
    <article className="card card-hover p-4 lg:p-5 group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-[0.8125rem] text-text-muted font-medium">
          <span className="text-ink-secondary">{result.podcastName}</span>
          <span>·</span>
          <span>{result.sourcePlatform}</span>
          <span>·</span>
          <span>{formatDate(result.publishDate)}</span>
        </div>
        <ConfidenceBadge score={result.relevanceScore} label="match" />
      </div>

      <h3 className="text-base font-semibold tracking-tight text-text-primary mb-2">
        {result.episodeTitle}
        {result.episodeNumber != null && (
          <span className="ml-2 text-text-muted font-normal text-sm">
            · Ep. {result.episodeNumber}
          </span>
        )}
      </h3>

      <div className="border-l-2 border-line-strong pl-4 py-0.5 mb-3">
        <p
          className="text-[15px] leading-relaxed text-text-primary"
          dangerouslySetInnerHTML={{
            __html: highlight(result.transcriptText, query),
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="pill bg-bg-elevated text-text-dim border border-border font-mono">
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          {formatTimestamp(result.startTimeSeconds)} →{" "}
          {formatTimestamp(result.endTimeSeconds)}
        </span>

        <div className="flex-1" />

        <Link href={episodeHref} className="btn-ghost text-xs">
          Open episode
        </Link>
        <a
          href={tsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="6,4 20,12 6,20" fill="currentColor" />
          </svg>
          Jump to timestamp
        </a>
        <button
          type="button"
          onClick={copyCitation}
          className="btn-secondary text-xs"
          title="Copy formatted citation"
        >
          {copied ? (
            <>
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  d="m5 12 5 5 9-11"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              Copy citation
            </>
          )}
        </button>
      </div>
    </article>
  );
}
