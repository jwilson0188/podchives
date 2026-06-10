import Link from "next/link";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { IS_DEMO_MODE } from "@/lib/constants";
import { isGateActive } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

export function TopNav() {
  const gateActive = isGateActive();

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg/80 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
          <span className="text-white font-bold text-xs">P</span>
        </div>
        <span className="font-semibold tracking-tight">Podchives</span>
      </div>

      <div className="flex-1 max-w-2xl">
        <GlobalSearchBar size="md" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {IS_DEMO_MODE && (
          <span className="hidden sm:inline-flex pill bg-cyan-muted text-cyan">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
            demo mode
          </span>
        )}
        {gateActive && !IS_DEMO_MODE && (
          <span className="hidden sm:inline-flex pill bg-success-muted text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            beta · solo
          </span>
        )}
        <Link href="/sources" className="btn-secondary">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add Source
        </Link>
        {gateActive && <SignOutButton />}
      </div>
    </header>
  );
}
