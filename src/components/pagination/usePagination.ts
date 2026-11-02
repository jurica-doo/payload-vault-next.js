"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, PAGE_SIZE_STORAGE_KEY } from "./Pagination.const";
import type { PaginationProps } from "./Pagination.types";

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

const isPageSize = (n: number) => (PAGE_SIZES as readonly number[]).includes(n);

/**
 * The user's rows-per-page preference (shared by all lists, kept in
 * localStorage). Read after mount so server and client render the same.
 */
export function usePageSize(): [number, (size: number) => void] {
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isPageSize(stored)) setSize(stored);
    } catch {
      // Storage blocked: keep the default.
    }
  }, []);

  const update = (next: number) => {
    setSize(next);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
    } catch {
      // Storage blocked: the choice lasts for this view only.
    }
  };

  return [size, update];
}

/** Page to show after a size change so the first visible row stays visible. */
export function pageAfterResize(page: number, oldSize: number, newSize: number): number {
  return Math.floor(((page - 1) * oldSize) / newSize) + 1;
}

/**
 * Client-side pagination for a fully loaded list. Returns the rows of the
 * current page and the props for <Pagination>. The page resets to 1 when
 * `resetKey` changes (pass the active filter/search/sort).
 */
export function usePagination<T>(
  items: T[],
  { resetKey }: { resetKey?: unknown } = {},
): { pageItems: T[]; pagination: PaginationProps } {
  const [pageSize, setPageSize] = usePageSize();
  const [page, setPage] = useState(1);

  // Render-time reset, no effect (same pattern as AppShell's drawer).
  const [lastKey, setLastKey] = useState(resetKey);
  if (!Object.is(lastKey, resetKey)) {
    setLastKey(resetKey);
    setPage(1);
  }

  const current = Math.min(page, pageCount(items.length, pageSize));
  const start = (current - 1) * pageSize;

  return {
    pageItems: items.slice(start, start + pageSize),
    pagination: {
      page: current,
      pageSize,
      total: items.length,
      onPageChange: setPage,
      onPageSizeChange: (size) => {
        setPage(pageAfterResize(current, pageSize, size));
        setPageSize(size);
      },
    },
  };
}
