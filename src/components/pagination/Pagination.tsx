"use client";

import { useId, useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { PAGE_SIZES, SCROLL_OFFSET_PX } from "./Pagination.const";
import type { PaginationProps } from "./Pagination.types";
import { pageCount } from "./usePagination";

const btn =
  "inline-flex h-8 items-center gap-1 rounded-radius-md border border-color-border-strong bg-color-bg-card px-2.5 text-sm font-medium text-color-text-main transition-[background-color,scale,opacity] duration-150 enabled:cursor-pointer enabled:hover:bg-color-bg-hover enabled:active:scale-[0.97] disabled:opacity-40";

/**
 * Pager for every list: "1–25 von 120", rows per page, previous/next.
 * Renders nothing while everything fits on one small page. After a page
 * change it scrolls the list (its parent element) back into view.
 */
export const Pagination = ({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) => {
  const ref = useRef<HTMLElement>(null);
  const sizeId = useId();
  if (total <= Math.min(pageSize, PAGE_SIZES[0])) return null;

  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(page, 1), pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const keepInView = () => {
    const list = ref.current?.parentElement;
    if (!list) return;
    const top = list.getBoundingClientRect().top;
    if (top < SCROLL_OFFSET_PX) window.scrollBy({ top: top - SCROLL_OFFSET_PX });
  };
  const go = (next: number) => {
    onPageChange(next);
    requestAnimationFrame(keepInView);
  };

  return (
    <nav
      ref={ref}
      aria-label="Seiten"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-color-text-subtle"
    >
      <div className="flex items-center gap-4">
        <span className="tabular" aria-live="polite">
          {from}–{to} von {total}
        </span>
        {onPageSizeChange && (
          <span className="flex items-center gap-2">
            <label htmlFor={sizeId} className="hidden sm:inline">
              Pro Seite
            </label>
            <select
              id={sizeId}
              aria-label="Einträge pro Seite"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                requestAnimationFrame(keepInView);
              }}
              className="h-8 w-auto rounded-radius-md border border-color-border-strong bg-color-bg-card py-0 pl-2 pr-7 text-sm text-color-text-main"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={btn} disabled={current <= 1} onClick={() => go(current - 1)}>
            <ChevronLeftIcon size={16} />
            Zurück
          </button>
          <span aria-current="page" className="tabular px-1 text-color-text-secondary">
            {current} / {pages}
          </span>
          <button type="button" className={btn} disabled={current >= pages} onClick={() => go(current + 1)}>
            Weiter
            <ChevronRightIcon size={16} />
          </button>
        </div>
      )}
    </nav>
  );
};
