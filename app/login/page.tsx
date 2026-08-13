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
    <main className="min-h-screen bg-canvas px-6 py-16 flex flex-col items-center justify-center">
      {/* Optical centering: nudge the block above true centre so it doesn't
          sit low once the eye accounts for the footnote below. */}
      <div className="w-full max-w-[22rem] -mt-12">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-6 flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-[0.5rem] bg-accent text-accent-contrast text-[0.9375rem] font-semibold"
            >
              P
            </span>
            <span className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-ink">
              Podchives
            </span>
          </div>

          <h1 className="text-[1.375rem] font-semibold tracking-[-0.018em] text-ink">
            Sign in
          </h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            This archive is private while in beta.
          </p>
        </div>

        <LoginForm next={next} />

        {searchParams.error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-critical/25 bg-critical-wash px-3 py-2 text-sm text-critical"
          >
            {searchParams.error === "invalid"
              ? "That password didn't match."
              : searchParams.error}
          </p>
        )}
      </div>

      <p className="mt-16 text-[0.8125rem] text-ink-muted">
        Multi-user accounts arrive in a later release.
      </p>
    </main>
  );
}
