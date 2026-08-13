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
    if (!password.trim() || submitting) return;
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
        setError(body?.error ?? "That password didn't match.");
        return;
      }
      router.replace(next || "/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="beta-password" className="label">
          Password
        </label>
        <input
          id="beta-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="Enter your password"
          required
        />
      </div>

      {/* Not disabled on empty input: password managers autofill without
          firing onChange, which would otherwise leave this stuck. */}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-critical/25 bg-critical-wash px-3 py-2 text-sm text-critical"
        >
          {error}
        </p>
      )}
    </form>
  );
}
