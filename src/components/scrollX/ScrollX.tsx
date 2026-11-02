"use client";

import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { IconButton } from "../iconButton/IconButton";

type Metrics = { overflow: boolean; ratio: number; pos: number };

const NONE: Metrics = { overflow: false, ratio: 1, pos: 0 };
/** Share of the visible width one arrow click scrolls. */
const STEP = 0.8;
const MIN_THUMB_PERCENT = 8;

type ScrollXProps = {
  children: ReactNode;
  /** Names the scrollable region for screen readers, e.g. "Mitarbeitende". */
  label: string;
  className?: string;
};

/**
 * Horizontal scroll container for wide tables. When the content overflows, a
 * bar sticks to the bottom of the screen (not of the table, which may be far
 * below) with arrows, a draggable thumb and a hint: mouse users without a
 * trackpad can always reach the hidden columns. Shift + mouse wheel scrolls
 * sideways in every browser. Ctrl + wheel stays the browser's zoom (and is
 * what a trackpad pinch sends), so it is deliberately not taken over.
 */
export const ScrollX = ({ children, label, className = "" }: ScrollXProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [m, setM] = useState<Metrics>(NONE);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = max > 1 ? { overflow: true, ratio: el.clientWidth / el.scrollWidth, pos: el.scrollLeft / max } : NONE;
    setM((prev) =>
      prev.overflow === next.overflow && prev.ratio === next.ratio && prev.pos === next.pos ? prev : next,
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    for (const child of el.children) observer?.observe(child);

    // A plain mouse wheel only scrolls vertically; Shift turns it sideways.
    // macOS already reports Shift+wheel as deltaX, which the browser handles.
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer?.disconnect();
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure]);

  const scrollStep = (dir: 1 | -1) => {
    const el = ref.current;
    el?.scrollBy({ left: dir * el.clientWidth * STEP, behavior: "smooth" });
  };

  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const track = trackRef.current;
    if (!el || !track || e.target !== track) return;
    const rect = track.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    el.scrollTo({ left: fraction * el.scrollWidth - el.clientWidth / 2, behavior: "smooth" });
  };

  const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, left: ref.current.scrollLeft };
  };

  const onThumbMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const track = trackRef.current;
    if (!drag.current || !el || !track) return;
    el.scrollLeft = drag.current.left + (e.clientX - drag.current.x) * (el.scrollWidth / track.clientWidth);
  };

  const thumbPercent = Math.max(m.ratio * 100, MIN_THUMB_PERCENT);
  const atStart = m.pos <= 0.001;
  const atEnd = m.pos >= 0.999;
  const fade = "pointer-events-none absolute inset-y-0 w-8 from-color-bg-card to-transparent transition-opacity duration-200";

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={ref}
          role={m.overflow ? "region" : undefined}
          aria-label={m.overflow ? label : undefined}
          tabIndex={m.overflow ? 0 : undefined}
          className={`overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-color-primary ${
            m.overflow ? "scrollbar-none" : ""
          }`}
        >
          {children}
        </div>
        {/* Edge fades hint at columns beyond the visible area. */}
        <span aria-hidden className={`${fade} left-0 bg-linear-to-r ${m.overflow && !atStart ? "opacity-100" : "opacity-0"}`} />
        <span aria-hidden className={`${fade} right-0 bg-linear-to-l ${m.overflow && !atEnd ? "opacity-100" : "opacity-0"}`} />
      </div>

      {m.overflow && (
        <div className="sticky bottom-0 z-[2] flex items-center gap-1.5 rounded-b-radius-lg border-t border-color-border-light bg-color-bg-card px-1.5 py-1 animate-fade-in">
          <IconButton icon={ChevronLeftIcon} label="Nach links scrollen" size="sm" disabled={atStart} onClick={() => scrollStep(-1)} />
          <div
            ref={trackRef}
            aria-hidden
            onPointerDown={onTrackDown}
            className="relative h-2.5 min-w-16 flex-1 cursor-pointer rounded-full bg-color-bg-alt"
          >
            <div
              onPointerDown={onThumbDown}
              onPointerMove={onThumbMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              style={{ width: `${thumbPercent}%`, left: `${m.pos * (100 - thumbPercent)}%` }}
              className="absolute inset-y-0 cursor-grab touch-none rounded-full bg-color-border-strong transition-colors hover:bg-color-text-subtle active:cursor-grabbing"
            />
          </div>
          <IconButton icon={ChevronRightIcon} label="Nach rechts scrollen" size="sm" disabled={atEnd} onClick={() => scrollStep(1)} />
          <span className="hidden whitespace-nowrap pr-1.5 text-xs text-color-text-subtle pointer-fine:inline">
            Umschalt + Mausrad
          </span>
        </div>
      )}
    </div>
  );
};
