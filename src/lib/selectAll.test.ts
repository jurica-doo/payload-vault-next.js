import { describe, expect, it, vi } from "vitest";
import { PAGE_SIZE, selectAll } from "./selectAll";
import { UserFacingError } from "../utils/dbErrors";

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: offset + i }));

describe("selectAll", () => {
  it("keeps loading pages until a short page arrives", async () => {
    const page = vi.fn((from: number) =>
      Promise.resolve({ data: from < 2 * PAGE_SIZE ? rows(PAGE_SIZE, from) : rows(5, from), error: null }),
    );
    const all = await selectAll(page);
    expect(all).toHaveLength(2 * PAGE_SIZE + 5);
    expect(page.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
  });

  it("stops after one request for a small list", async () => {
    const page = vi.fn(() => Promise.resolve({ data: rows(3), error: null }));
    expect(await selectAll(page)).toHaveLength(3);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("turns an error into a German user-facing error", async () => {
    await expect(selectAll(() => Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } }))).rejects.toBeInstanceOf(UserFacingError);
  });
});
