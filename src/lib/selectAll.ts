import { throwDbError } from "../utils/dbErrors";

/**
 * The API returns at most `max_rows` (1.000) rows per request, silently. Lists
 * that can grow past that (employees, level history, structure, a leader's
 * monthly ledger) are loaded page by page until a short page arrives.
 *
 * `page(from, to)` must return the same query with `.range(from, to)` and a
 * deterministic order (end with a unique column such as `id`), otherwise rows
 * could repeat or go missing between pages.
 */
export const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function selectAll<T>(page: (from: number, to: number) => PageResult<T>, maxRows = 50_000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throwDbError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
  return rows;
}
