"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { formatTimestamp } from "@/lib/utils";

export type PlayerHandle = {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
};

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const idx = parts.findIndex(
      (p) => p === "embed" || p === "shorts" || p === "live",
    );
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return null;
  } catch {
    return null;
  }
}

export const EpisodePlayer = forwardRef<
  PlayerHandle,
  {
    sourceUrl: string;
    title: string;
    initialSeconds?: number;
    thumbnailUrl?: string;
    onTimeUpdate?: (seconds: number) => void;
  }
>(function EpisodePlayer(
  { sourceUrl, title, initialSeconds = 0, thumbnailUrl, onTimeUpdate },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const currentTimeRef = useRef(initialSeconds);
  const ytId = getYouTubeId(sourceUrl);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      currentTimeRef.current = seconds;
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          event: "command",
          func: "seekTo",
          args: [seconds, true],
        }),
        "*",
      );
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          event: "command",
          func: "playVideo",
          args: [],
        }),
        "*",
      );
    },
    getCurrentTime: () => currentTimeRef.current,
  }));

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      try {
        const data =
          typeof e.data === "string" ? JSON.parse(e.data) : (e.data as any);
        if (data?.event === "infoDelivery" && data.info?.currentTime != null) {
          currentTimeRef.current = data.info.currentTime;
          onTimeUpdate?.(data.info.currentTime);
        }
      } catch {
        // ignored
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onTimeUpdate]);

  if (!ytId) {
    return (
      <div className="aspect-video w-full rounded-xl border border-border bg-bg-elevated flex items-center justify-center text-center text-text-muted p-6">
        <div>
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-card flex items-center justify-center">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <polygon points="6,4 20,12 6,20" />
            </svg>
          </div>
          <div className="text-sm font-medium text-text-primary mb-1">
            {title}
          </div>
          <div className="text-xs">
            No embeddable player for this source —{" "}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan hover:underline"
            >
              open original
            </a>
          </div>
        </div>
      </div>
    );
  }

  const start = Math.max(0, Math.floor(initialSeconds));
  const src = `https://www.youtube.com/embed/${ytId}?enablejsapi=1&start=${start}&rel=0&modestbranding=1`;

  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden border border-border bg-black relative">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
      {start > 0 && (
        <div className="absolute top-2 left-2 pill bg-black/70 text-white border border-white/10 font-mono">
          starts at {formatTimestamp(start)}
        </div>
      )}
    </div>
  );
});
