"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Wrong password.");
        return;
      }
      router.replace(next || "/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Password</label>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input font-mono"
          placeholder="••••••••"
          required
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !password.trim()}
        className="btn-primary w-full"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <div className="px-3 py-2 rounded-md bg-danger-muted text-danger border border-danger/30 text-xs font-mono">
          {error}
        </div>
      )}
    </form>
  );
}
