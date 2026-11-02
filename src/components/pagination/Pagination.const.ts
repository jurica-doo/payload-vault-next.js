export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const DEFAULT_PAGE_SIZE = 25;

/** One preference for every list: whoever prefers 50 rows wants it everywhere. */
export const PAGE_SIZE_STORAGE_KEY = "page-size";

/** Space kept free above a list when a page change scrolls back to its top (sticky header). */
export const SCROLL_OFFSET_PX = 72;
