import Link from "next/link";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { IS_DEMO_MODE } from "@/lib/constants";
import { isGateActive } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

export function TopNav() {
  const gateActive = isGateActive();

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg/80 backdrop-blur-md flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-4">
      <div className="lg:hidden flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
          <span className="text-white font-bold text-xs">P</span>
        </div>
        <span className="font-semibold tracking-tight text-sm sm:text-base">
          Podchives
        </span>
      </div>

      {/* Full search on sm+; icon shortcut on xs (bottom nav has Search too) */}
      <div className="hidden sm:block flex-1 max-w-2xl min-w-0">
        <GlobalSearchBar size="md" />
      </div>
      <Link
        href="/search"
        className="sm:hidden p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated flex-shrink-0"
        aria-label="Search"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </Link>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {IS_DEMO_MODE && (
          <span className="hidden md:inline-flex pill bg-cyan-muted text-cyan text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
            demo
          </span>
        )}
        {gateActive && !IS_DEMO_MODE && (
          <span className="hidden md:inline-flex pill bg-success-muted text-success text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            beta
          </span>
        )}
        <Link
          href="/sources"
          className="btn-secondary px-2.5 sm:px-3.5 min-h-[36px] sm:min-h-0"
          aria-label="Add source"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Add Source</span>
        </Link>
        {gateActive && <SignOutButton />}
      </div>
    </header>
  );
}
