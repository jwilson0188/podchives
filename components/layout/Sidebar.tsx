"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { NavIcon } from "./NavIcon";

/** Grouped so the list reads as sections rather than ten equal items. */
const GROUPS: { heading: string | null; hrefs: string[] }[] = [
  { heading: null, hrefs: ["/dashboard"] },
  { heading: "Find", hrefs: ["/search", "/advanced-search"] },
  { heading: "Library", hrefs: ["/archives", "/episodes"] },
  {
    heading: "Pipeline",
    hrefs: ["/download-manager", "/processing-queue", "/sources"],
  },
  { heading: "Account", hrefs: ["/usage", "/settings"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const itemFor = (href: string) => NAV_ITEMS.find((i) => i.href === href);

  return (
    <aside className="hidden lg:flex w-[15rem] shrink-0 flex-col border-r border-line bg-canvas">
      <div className="px-5 pt-5 pb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none"
        >
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-[0.4375rem] bg-accent text-accent-contrast text-[0.8125rem] font-semibold"
          >
            P
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-[-0.015em] text-ink">
            Podchives
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group, gi) => (
          <div key={group.heading ?? gi} className={gi === 0 ? "" : "mt-5"}>
            {group.heading && (
              <div className="px-2 pb-1.5 text-[0.6875rem] font-medium text-ink-muted">
                {group.heading}
              </div>
            )}
            <div className="space-y-px">
              {group.hrefs.map((href) => {
                const item = itemFor(href);
                if (!item) return null;
                const active =
                  pathname === href || pathname?.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-md px-2 py-1.5",
                      "text-[0.8125rem] transition-colors duration-100",
                      active
                        ? "bg-sunken font-medium text-ink"
                        : "text-ink-secondary hover:bg-sunken/70 hover:text-ink",
                    )}
                  >
                    {/* Accent reserved for the current location only. */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition-opacity",
                        active ? "bg-accent opacity-100" : "opacity-0",
                      )}
                    />
                    <span
                      className={cn(
                        "shrink-0 transition-colors",
                        active
                          ? "text-ink"
                          : "text-ink-muted group-hover:text-ink-secondary",
                      )}
                    >
                      <NavIcon name={item.icon} active={active} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
