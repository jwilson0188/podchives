"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Scrolls to a hash target after client navigation (Next.js Link). */
export function ScrollToHash({ id }: { id: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${id}`) return;

    const el = document.getElementById(id);
    if (!el) return;

    // Defer until layout paints so the target is in the DOM at its final position.
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, id]);

  return null;
}
