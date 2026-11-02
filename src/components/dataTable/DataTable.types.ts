import type { ReactNode } from "react";
import type { PaginationProps } from "../pagination/Pagination.types";

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

/** Server-side pages; pass onPageSizeChange to offer 10/25/50/100. */
export type DataTablePagination = PaginationProps;

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
  /** Client-side pages for fully loaded rows (default on). Off for short, fixed lists. */
  paginate?: boolean;
  onRowClick?: (row: T) => void;
};
