"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Start the bar only if navigation takes longer than this (no flicker). */
const SHOW_DELAY = 120;
/** Never leave the bar hanging (e.g. a link to the same page). */
const SAFETY_TIMEOUT = 12000;

type Phase = "idle" | "loading" | "done";

/**
 * Thin top progress bar during client-side navigation. Starts on clicks of
 * internal links and browser back/forward, finishes when the new route has
 * rendered (pathname/search change). Pure CSS animation, respects
 * prefers-reduced-motion via the global rule.
 */
export const NavigationProgress = () => {
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    const start = () => {
      clear();
      timers.current.push(setTimeout(() => setPhase("loading"), SHOW_DELAY));
      timers.current.push(setTimeout(() => setPhase("idle"), SAFETY_TIMEOUT));
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      clear();
    };
  }, []);

  // Route rendered: finish the bar (render-time reset of a pending start).
  const routeKey = `${pathname}?${search.toString()}`;
  const [lastKey, setLastKey] = useState(routeKey);
  if (lastKey !== routeKey) {
    setLastKey(routeKey);
    if (phase === "loading") setPhase("done");
  }

  // New route: cancel a pending start (fast navigations never show the bar).
  useEffect(() => {
    clear();
  }, [routeKey]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 350);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]"
    >
      <div
        className={`h-full rounded-r-full bg-gradient-to-r from-color-primary to-color-primary-light shadow-[0_0_10px_var(--color-primary)] ${
          phase === "loading" ? "nav-progress-loading" : "nav-progress-done"
        }`}
      />
    </div>
  );
};
