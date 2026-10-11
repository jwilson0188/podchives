"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoDownload } from "@/lib/demoData";

export function DownloadActions({ download }: { download: DemoDownload }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (download.status === "completed") return null;
  const retry = download.status === "failed";
  const act = async () => {
    if (pending.current || done) return;
    pending.current = true; setBusy(true); setMessage(null); setError(false);
    try {
      const response = await fetch(`/api/downloads/${encodeURIComponent(download.id)}/${retry ? "retry" : "stop"}`, { method: "POST", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 409 ? "Download history changed or is ambiguous. Select the job in Processing Queue." : response.status === 404 ? "Download no longer exists. Refresh the page." : "Unable to update download. Please try again.");
      if (body?.ok !== true || (body.demo !== true && (body.demo !== false || (retry ? typeof body.result?.id !== "string" : body.result?.stopped !== true)))) throw new Error("Action was not confirmed. Refresh before trying again.");
      setMessage(body.demo ? "Demo preview only — no jobs were changed." : retry ? "Retry queued." : "Episode processing stopped. An external transfer already running may finish.");
      setDone(!body.demo);
      if (!body.demo) router.refresh();
    } catch (err) { setError(true); setMessage(err instanceof Error ? err.message : "Unable to update download."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className="text-left whitespace-normal max-w-xs">
    <button type="button" onClick={act} disabled={busy || done} aria-busy={busy} className="btn-secondary text-xs disabled:opacity-50">
      {busy ? "Updating…" : done ? "Updated" : retry ? "Retry download" : "Stop episode processing"}
    </button>
    {!retry && <p className="text-xs text-text-muted mt-1">Stops this episode’s queued and running jobs. Keeps saved transcripts.</p>}
    {message && <p role={error ? "alert" : "status"} className={`text-xs mt-2 ${error ? "text-danger" : "text-text-muted"}`}>{message}</p>}
    {error && <Link className="text-xs text-accent underline" href="/processing-queue">Open Processing Queue</Link>}
  </div>;
}
