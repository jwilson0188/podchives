"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { NavIcon } from "./NavIcon";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-bg-subtle/40 flex-col">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shadow-glow">
            <span className="text-white font-bold text-sm tracking-tight">
              P
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-text-primary">
              Podchives
            </div>
            <div className="text-[10px] uppercase tracking-widest text-text-muted">
              archive · search · index
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent-muted text-accent border-l-2 border-accent pl-[10px]"
                  : "text-text-muted hover:text-text-primary hover:bg-bg-elevated",
              )}
            >
              <NavIcon name={item.icon} active={active} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="card px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-text-muted">
              Worker
            </span>
            <span className="pill bg-success-muted text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              online
            </span>
          </div>
          <div className="text-xs text-text-dim font-mono">worker-local-01</div>
        </div>
      </div>
    </aside>
  );
}
