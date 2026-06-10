import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { isGateActive } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  // If the gate isn't active, /login has no purpose — bounce to dashboard.
  if (!isGateActive()) {
    redirect("/dashboard");
  }

  const next = searchParams.next ?? "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6 terminal-grid">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-base tracking-tight">
                P
              </span>
            </div>
            <div className="text-left">
              <div className="font-semibold tracking-tight text-text-primary">
                Podchives
              </div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted">
                archive · search · index
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1.5">
            Beta access
          </h1>
          <p className="text-sm text-text-muted">
            Single-user beta. Enter the password to continue.
          </p>
        </div>

        <div className="card p-6">
          <LoginForm next={next} />
          {searchParams.error && (
            <div className="mt-3 px-3 py-2 rounded-md bg-danger-muted text-danger border border-danger/30 text-xs font-mono">
              {searchParams.error === "invalid"
                ? "Wrong password."
                : searchParams.error}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-text-muted font-mono">
          Multi-user auth ships in a later phase.
        </p>
      </div>
    </div>
  );
}
