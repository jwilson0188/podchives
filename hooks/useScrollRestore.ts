"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function getScrollContainer(): HTMLElement | null {
  return document.querySelector("main");
}

/** Restore scroll position on back navigation (main is the scroll container). */
export function useScrollRestore(enabled = true) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const storageKey = `scroll:${pathname}${query ? `?${query}` : ""}`;

  useEffect(() => {
    if (!enabled) return;

    const main = getScrollContainer();
    if (!main) return;

    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const top = parseInt(saved, 10);
      requestAnimationFrame(() => {
        main.scrollTop = top;
      });
    }

    return () => {
      sessionStorage.setItem(storageKey, String(main.scrollTop));
    };
  }, [storageKey, enabled]);
}
