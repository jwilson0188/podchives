"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { NavIcon } from "./NavIcon";

const BOTTOM_NAV = [
  { label: "Home", href: "/dashboard", icon: "grid" },
  { label: "Search", href: "/search", icon: "search" },
  { label: "Episodes", href: "/episodes", icon: "list" },
  { label: "Sources", href: "/sources", icon: "link" },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <>
      {/* Bottom tab bar — primary routes on thumb reach */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg/95 backdrop-blur-md safe-bottom"
        aria-label="Main navigation"
      >
        <div className="flex items-stretch justify-around px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {BOTTOM_NAV.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 px-2 rounded-lg text-[10px] font-medium transition-colors",
                  active
                    ? "text-accent"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                <NavIcon name={item.icon} active={active} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[4rem] py-2 px-2 rounded-lg text-[10px] font-medium text-text-muted hover:text-text-primary"
            aria-label="Open menu"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
            More
          </button>
        </div>
      </nav>

      {/* Slide-out drawer for full nav */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 bottom-0 w-[min(100vw-3rem,320px)] bg-bg-subtle border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
                <span className="font-semibold">Podchives</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors min-h-[44px]",
                      active
                        ? "bg-accent-muted text-accent"
                        : "text-text-muted hover:text-text-primary hover:bg-bg-elevated",
                    )}
                  >
                    <NavIcon name={item.icon} active={active} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
