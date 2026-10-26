import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export type SortState = { columnId: string; direction: SortDirection } | null;

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. Strings compare with de-DE collation. */
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right";
  /** Hidden in the mobile card layout (keep at most ~4 visible there). */
  hideOnMobile?: boolean;
};

export type DataTablePagination = {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export type DataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  caption?: string;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyHint?: string;
  /**
   * Controlled sorting for server-side data. When omitted the table sorts the
   * given rows itself (fine for small, fully loaded lists only).
   */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  pagination?: DataTablePagination;
  onRowClick?: (row: T) => void;
};
