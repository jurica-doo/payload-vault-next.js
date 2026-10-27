"use client";

import { useState } from "react";
import { EmptyState } from "../emptyState/EmptyState";
import { AlertCircleIcon, ChevronDownIcon } from "../icons";
import type { DataTableProps, SortState } from "./DataTable.types";
import { nextSort, pageCount, sortRows } from "./DataTable.utils";

const SKELETON_ROWS = 5;

/**
 * Generic list for every sales-system table. Desktop: a real <table> with
 * sortable headers (aria-sort). Mobile: one card per row with the columns not
 * marked `hideOnMobile`. Loading, error and empty states are built in, so
 * every screen shows them the same way.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  caption,
  isLoading = false,
  error = null,
  emptyMessage = "Keine Einträge gefunden",
  emptyHint,
  sort: controlledSort,
  onSortChange,
  pagination,
  onRowClick,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<SortState>(null);
  const isControlled = onSortChange !== undefined;
  const sort = isControlled ? (controlledSort ?? null) : localSort;
  const visibleRows = isControlled ? rows : sortRows(rows, columns, sort);
  const mobileColumns = columns.filter((c) => !c.hideOnMobile);

  const handleSort = (columnId: string) => {
    const next = nextSort(sort, columnId);
    if (isControlled) onSortChange(next);
    else setLocalSort(next);
  };

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-radius-lg border border-color-error-border/30 bg-color-bg-error-subtle px-4 py-3 text-sm text-color-error-text"
      >
        <AlertCircleIcon size={18} className="mt-px shrink-0" />
        {error}
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="ui-card">
        <EmptyState message={emptyMessage} hint={emptyHint} compact />
      </div>
    );
  }

  const rowProps = (row: T) =>
    onRowClick
      ? {
          onClick: () => onRowClick(row),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(row);
            }
          },
          tabIndex: 0,
          className: "cursor-pointer transition-colors duration-100 hover:bg-color-bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-color-primary",
        }
      : {};

  return (
    <div className="flex flex-col gap-3" aria-busy={isLoading}>
      {/* Desktop */}
      <div className="ui-card hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-[1] bg-color-bg-alt">
            <tr>
              {columns.map((col) => {
                const active = sort?.columnId === col.id;
                const ariaSort = active
                  ? sort.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : col.sortValue
                    ? "none"
                    : undefined;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`h-10 border-b border-color-border-light px-4 text-xs font-medium uppercase tracking-wide whitespace-nowrap text-color-text-subtle first:rounded-tl-radius-lg last:rounded-tr-radius-lg ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.id)}
                        className={`group inline-flex cursor-pointer items-center gap-1 uppercase tracking-wide transition-colors hover:text-color-text-main ${active ? "text-color-text-main" : ""}`}
                      >
                        {col.header}
                        <ChevronDownIcon
                          aria-hidden
                          size={14}
                          className={`transition-all duration-150 ${
                            active
                              ? sort.direction === "asc"
                                ? "rotate-180 opacity-100"
                                : "opacity-100"
                              : "opacity-0 group-hover:opacity-50"
                          }`}
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={`skeleton-${i}`} data-testid="skeleton-row">
                    {columns.map((col) => (
                      <td key={col.id} className="border-b border-color-border-light px-4 py-3.5 last:border-b-0">
                        <span className="skeleton block h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : visibleRows.map((row) => (
                  <tr key={getRowId(row)} {...rowProps(row)} className={`group/row ${rowProps(row).className ?? "transition-colors duration-100 hover:bg-color-bg-hover/60"}`}>
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={`border-b border-color-border-light px-4 py-3 text-color-text-main group-last/row:border-b-0 ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="flex flex-col gap-2 md:hidden">
        {isLoading
          ? Array.from({ length: 3 }, (_, i) => (
              <li key={`m-skeleton-${i}`} className="skeleton h-20 rounded-radius-lg" />
            ))
          : visibleRows.map((row) => (
              <li
                key={getRowId(row)}
                className="ui-card overflow-hidden p-3.5 animate-fade-in"
              >
                <dl {...rowProps(row)} className={`-m-3.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 p-3.5 text-sm ${rowProps(row).className ?? ""}`}>
                  {mobileColumns.map((col) => (
                    <div key={col.id} className="contents">
                      <dt className="text-color-text-subtle">{col.header}</dt>
                      <dd className="break-words text-right text-color-text-main">{col.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
      </ul>

      {pagination && <Pager {...pagination} />}
    </div>
  );
}

const Pager = ({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) => {
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(page, 1), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-radius-md border border-color-border-strong bg-color-bg-card px-3 text-sm font-medium text-color-text-main transition-all duration-150 enabled:cursor-pointer enabled:hover:bg-color-bg-hover enabled:active:scale-[0.97] disabled:opacity-40";

  return (
    <nav aria-label="Seiten" className="flex items-center justify-between gap-3 text-sm text-color-text-subtle">
      <span className="tabular">
        {from}–{to} von {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          Zurück
        </button>
        <span aria-current="page" className="tabular px-1 text-color-text-secondary">
          {current} / {pages}
        </span>
        <button type="button" className={btn} disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
          Weiter
        </button>
      </div>
    </nav>
  );
};
