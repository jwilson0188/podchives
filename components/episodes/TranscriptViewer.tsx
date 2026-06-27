"use client";

import { useMemo, useRef, useState } from "react";
import type { DemoTranscriptSegment } from "@/lib/demoData";
import { EpisodePlayer, type PlayerHandle } from "./EpisodePlayer";
import { formatTimestamp, highlight } from "@/lib/utils";

export function TranscriptViewer({
  episodeTitle,
  podcastName,
  sourceUrl,
  thumbnailUrl,
  segments,
  initialSeconds = 0,
}: {
  episodeTitle: string;
  podcastName: string;
  sourceUrl: string;
  thumbnailUrl: string;
  segments: DemoTranscriptSegment[];
  initialSeconds?: number;
}) {
  const playerRef = useRef<PlayerHandle | null>(null);
  const [activeSegId, setActiveSegId] = useState<string | null>(null);
  const [transcriptQuery, setTranscriptQuery] = useState("");

  const filtered = useMemo(() => {
    const q = transcriptQuery.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter((s) =>
      s.transcriptText.toLowerCase().includes(q),
    );
  }, [segments, transcriptQuery]);

  const onSegClick = (seg: DemoTranscriptSegment) => {
    setActiveSegId(seg.id);
    playerRef.current?.seekTo(seg.startTimeSeconds);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
      <div className="space-y-4">
        <EpisodePlayer
          ref={playerRef}
          sourceUrl={sourceUrl}
          title={episodeTitle}
          thumbnailUrl={thumbnailUrl}
          initialSeconds={initialSeconds}
        />

        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2 font-medium">
            Source attribution
          </div>
          <div className="space-y-1.5 text-sm font-mono">
            <Row label="podcast" value={podcastName} />
            <Row label="episode" value={episodeTitle} />
            <Row
              label="source"
              value={
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:underline truncate inline-block max-w-full align-bottom"
                >
                  {sourceUrl}
                </a>
              }
            />
          </div>
        </div>
      </div>

      <div className="card p-0 flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold tracking-tight mb-2 text-sm">
            Transcript
            <span className="ml-2 text-text-muted font-normal text-xs tabular-nums">
              {segments.length} segments
            </span>
          </h3>
          <input
            type="search"
            value={transcriptQuery}
            onChange={(e) => setTranscriptQuery(e.target.value)}
            placeholder="Search within this episode…"
            className="input text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted text-sm">
              {segments.length === 0
                ? "Transcript not yet available for this episode."
                : `No segments match "${transcriptQuery}".`}
            </div>
          ) : (
            <div>
              {filtered.map((seg) => {
                const active = activeSegId === seg.id;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => onSegClick(seg)}
                    className={
                      "w-full text-left px-4 py-2.5 border-b border-border/60 transition-colors flex gap-3 " +
                      (active
                        ? "bg-accent-muted border-l-2 border-l-accent pl-[14px]"
                        : "hover:bg-bg-elevated")
                    }
                  >
                    <span
                      className={
                        "text-[11px] font-mono tabular-nums shrink-0 w-14 pt-0.5 " +
                        (active ? "text-accent" : "text-text-muted")
                      }
                    >
                      {formatTimestamp(seg.startTimeSeconds)}
                    </span>
                    <span
                      className={
                        "text-sm leading-relaxed " +
                        (active ? "text-text-primary" : "text-text-dim")
                      }
                      dangerouslySetInnerHTML={{
                        __html: highlight(seg.transcriptText, transcriptQuery),
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[11px] uppercase tracking-widest text-text-muted w-16 shrink-0">
        {label}
      </span>
      <span className="text-text-primary truncate">{value}</span>
    </div>
  );
}
