"use client";

import { type RefObject, useLayoutEffect, useState } from "react";

/** Gap between trigger and panel, and minimum distance to the viewport edge. */
const GAP = 4;
const EDGE = 8;

export type AnchoredPosition = {
  top: number;
  left?: number;
  right?: number;
  /** Matches the trigger width when `matchWidth` is set. */
  width?: number;
  /** Space left on the chosen side; panels that may be long cap their height to it. */
  maxHeight: number;
  /** Opened above the trigger (no room below). */
  up: boolean;
};

type Options = {
  /** Which side to try first; flips when the panel does not fit there. */
  prefer?: "bottom" | "top";
  align?: "left" | "right";
  /** Panel at least as wide as the trigger, never narrower than `minWidth`. */
  matchWidth?: boolean;
  minWidth?: number;
};

/**
 * Places a floating panel (menu, dropdown list) rendered in a portal with
 * `position: fixed` next to its trigger. It opens on the preferred side,
 * flips when the panel does not fit, and follows the trigger while anything
 * scrolls (capture: inner scroll boxes too) or the window resizes. Returns
 * null until measured, so the panel can stay invisible for its first frame.
 */
export function useAnchoredPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  { prefer = "bottom", align = "left", matchWidth = false, minWidth = 0 }: Options = {},
): AnchoredPosition | null {
  const [pos, setPos] = useState<AnchoredPosition | null>(null);

  // Closed panels forget their place (render-time reset, no effect).
  if (!open && pos) setPos(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const height = panel.scrollHeight;
      const below = window.innerHeight - trigger.bottom - GAP - EDGE;
      const above = trigger.top - GAP - EDGE;
      const fitsPreferred = (prefer === "bottom" ? below : above) >= height;
      const up = prefer === "top" ? fitsPreferred || above > below : !fitsPreferred && above > below;
      const maxHeight = Math.max(0, up ? above : below);
      const shown = Math.min(height, maxHeight);
      const top = up ? trigger.top - GAP - shown : trigger.bottom + GAP;
      const width = matchWidth ? Math.max(trigger.width, minWidth) : undefined;
      setPos(
        align === "right"
          ? { top, right: Math.max(EDGE, window.innerWidth - trigger.right), width, maxHeight, up }
          : {
              top,
              left: Math.max(EDGE, Math.min(trigger.left, window.innerWidth - EDGE - (width ?? panel.offsetWidth))),
              width,
              maxHeight,
              up,
            },
      );
    };
    // Scrolling inside the panel itself (a long list) does not move it.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      place();
    };
    place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, prefer, align, matchWidth, minWidth, triggerRef, panelRef]);

  return pos;
}
