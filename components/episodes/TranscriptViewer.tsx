"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DemoTranscriptSegment } from "@/lib/demoData";
import { Collapsible } from "@/components/ui/Collapsible";
import { EpisodePlayer, type PlayerHandle } from "./EpisodePlayer";
import { formatTimestamp, highlight } from "@/lib/utils";

export function TranscriptViewer({
  episodeTitle,
  archiveName,
  sourceName,
  sourceChannelUrl,
  sourceTypeLabel,
  videoUrl,
  thumbnailUrl,
  segments,
}: {
  episodeTitle: string;
  archiveName: string;
  sourceName: string;
  sourceChannelUrl: string;
  sourceTypeLabel: string;
  videoUrl: string;
  thumbnailUrl: string;
  segments: DemoTranscriptSegment[];
}) {
  const searchParams = useSearchParams();
  const initialSeconds = useMemo(() => {
    const t = searchParams.get("t");
    return t ? parseInt(t, 10) || 0 : 0;
  }, [searchParams]);
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
    <div className="flex flex-col gap-4 lg:gap-6 min-w-0">
      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 lg:gap-6 min-w-0">
        <EpisodePlayer
          ref={playerRef}
          sourceUrl={videoUrl}
          title={episodeTitle}
          thumbnailUrl={thumbnailUrl}
          initialSeconds={initialSeconds}
        />

        <div className="card p-0 flex flex-col min-w-0 max-h-[min(65vh,560px)] lg:max-h-[80vh]">
          <div className="px-3 sm:px-4 py-3 border-b border-border shrink-0">
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

          <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 min-h-0">
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
                        "w-full text-left px-3 sm:px-4 py-2.5 border-b border-border/60 transition-colors flex gap-2 sm:gap-3 min-w-0 " +
                        (active
                          ? "bg-accent-muted border-l-2 border-l-accent pl-[10px] sm:pl-[14px]"
                          : "hover:bg-bg-elevated")
                      }
                    >
                      <span
                        className={
                          "text-[0.8125rem] font-mono tabular-nums shrink-0 w-12 sm:w-14 pt-0.5 " +
                          (active ? "text-accent" : "text-text-muted")
                        }
                      >
                        {formatTimestamp(seg.startTimeSeconds)}
                      </span>
                      <span
                        className={
                          "text-sm leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] " +
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

      <Collapsible
        variant="card"
        defaultOpen={false}
        title={
          <span className="text-[0.75rem] text-text-muted font-medium">
            Source attribution
          </span>
        }
        summary={`${archiveName} · ${sourceName}`}
        headerClassName="px-4 py-3"
        contentClassName="px-4 pb-4 pt-0 border-t-0"
      >
        <div className="space-y-2 text-sm font-mono min-w-0">
          <Row label="archive" value={archiveName} />
          <Row
            label="source"
            value={
              <a
                href={sourceChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan hover:underline break-words [overflow-wrap:anywhere]"
              >
                {sourceName}
              </a>
            }
            sub={sourceTypeLabel}
          />
          <Row label="episode" value={episodeTitle} />
          <Row
            label="video"
            value={
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan hover:underline break-all"
              >
                {videoUrl}
              </a>
            }
          />
        </div>
      </Collapsible>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] gap-1 sm:gap-3 min-w-0">
      <span className="text-[0.8125rem] text-text-muted shrink-0">
        {label}
      </span>
      <div className="min-w-0">
        <span className="text-text-primary min-w-0 break-words [overflow-wrap:anywhere] block">
          {value}
        </span>
        {sub && (
          <span className="text-[0.75rem] text-text-dim mt-0.5 block">{sub}</span>
        )}
      </div>
    </div>
  );
}
