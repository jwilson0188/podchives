"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

type SourceType =
  | "youtube_channel"
  | "youtube_playlist"
  | "youtube_video"
  | "rss";

const TYPE_OPTIONS: { value: SourceType; label: string; hint: string }[] = [
  {
    value: "youtube_channel",
    label: "YouTube channel",
    hint: "https://www.youtube.com/@channelname",
  },
  {
    value: "youtube_playlist",
    label: "YouTube playlist",
    hint: "https://www.youtube.com/playlist?list=PLxxxx",
  },
  {
    value: "youtube_video",
    label: "YouTube video",
    hint: "https://www.youtube.com/watch?v=VIDEO_ID",
  },
  {
    value: "rss",
    label: "RSS feed",
    hint: "https://www.omnycontent.com/.../podcast.rss",
  },
];

export function AddSourceForm() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceType>("youtube_channel");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error" | null;
    text: string;
  }>({ kind: null, text: "" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setMessage({ kind: null, text: "" });
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceUrl: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to add source");
      }
      setMessage({
        kind: "success",
        text: json.demo
          ? "Source queued (demo mode — wire up DATABASE_URL to persist)."
          : "Source added — sync queued. Run the worker to start ingestion.",
      });
      setUrl("");
      // Refresh the server component so the new source appears in the list
      // on the left without a full page reload.
      router.refresh();
    } catch (err: any) {
      setMessage({ kind: "error", text: err?.message ?? "Failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const hint = TYPE_OPTIONS.find((o) => o.value === sourceType)?.hint;

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold tracking-tight mb-1">Add a source</h2>
        <p className="text-xs text-text-muted">
          Paste a YouTube URL or podcast RSS feed. Episodes will be discovered,
          downloaded, transcribed, and indexed automatically.
        </p>
      </div>

      <div>
        <label className="label">Source type</label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {TYPE_OPTIONS.map((opt) => {
            const active = sourceType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceType(opt.value)}
                className={
                  "text-left px-3 py-2.5 rounded-md border transition-colors " +
                  (active
                    ? "border-accent bg-accent-muted"
                    : "border-border bg-bg-subtle hover:border-border-strong")
                }
              >
                <div
                  className={
                    "text-sm font-medium " +
                    (active ? "text-accent" : "text-text-primary")
                  }
                >
                  {opt.label}
                </div>
                <div className="text-[10px] text-text-muted font-mono truncate">
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="source-url">
          {sourceType === "rss" ? "RSS feed URL" : "YouTube URL"}
        </label>
        <input
          id="source-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={hint}
          className="input font-mono text-base sm:text-sm min-h-[44px]"
          required
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-end sm:justify-between gap-3">
        <p className="text-[11px] text-text-muted sm:max-w-[55%]">
          Authenticated sources (Patreon, members-only) require cookies. Set{" "}
          <code className="text-cyan">YOUTUBE_COOKIES_FILE</code> in your env.
        </p>
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="btn-primary text-sm w-full sm:w-auto min-h-[44px] flex-shrink-0"
        >
          {submitting ? "Adding…" : "Add source"}
        </button>
      </div>

      {message.kind === "error" && (
        <ErrorMessage>{message.text}</ErrorMessage>
      )}
      {message.kind === "success" && (
        <div className="rounded-md px-3 py-2 text-sm bg-success-muted text-success border border-success/30">
          {message.text}
        </div>
      )}
    </form>
  );
}
