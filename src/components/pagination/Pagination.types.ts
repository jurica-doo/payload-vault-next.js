export type PaginationProps = {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Shows the rows-per-page picker (10/25/50/100). */
  onPageSizeChange?: (pageSize: number) => void;
};
