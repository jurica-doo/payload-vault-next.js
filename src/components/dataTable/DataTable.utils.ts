import type { DataTableColumn, SortState } from "./DataTable.types";

const collator = new Intl.Collator("de-DE", { numeric: true, sensitivity: "base" });

/** Cycles none → asc → desc → none for one column. */
export function nextSort(current: SortState, columnId: string): SortState {
  if (!current || current.columnId !== columnId) return { columnId, direction: "asc" };
  if (current.direction === "asc") return { columnId, direction: "desc" };
  return null;
}

/** Stable sort; nulls always last regardless of direction. */
export function sortRows<T>(rows: T[], columns: DataTableColumn<T>[], sort: SortState): T[] {
  if (!sort) return rows;
  const column = columns.find((c) => c.id === sort.columnId);
  if (!column?.sortValue) return rows;
  const getValue = column.sortValue;
  const factor = sort.direction === "asc" ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const cmp =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return cmp === 0 ? a.index - b.index : cmp * factor;
    })
    .map((entry) => entry.row);
}

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
