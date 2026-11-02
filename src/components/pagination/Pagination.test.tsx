import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";
import { PAGE_SIZE_STORAGE_KEY } from "./Pagination.const";
import { pageAfterResize, pageCount, usePagination } from "./usePagination";

const items = Array.from({ length: 60 }, (_, i) => i + 1);

describe("pagination helpers", () => {
  it("counts pages and keeps the first visible row after a resize", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(60, 25)).toBe(3);
    // Page 3 of 10 starts at row 21; with 25 per page that is page 1.
    expect(pageAfterResize(3, 10, 25)).toBe(1);
    expect(pageAfterResize(3, 25, 10)).toBe(6);
  });
});

describe("usePagination", () => {
  beforeEach(() => localStorage.clear());

  it("slices the current page and resets when the key changes", () => {
    const { result, rerender } = renderHook(({ key }) => usePagination(items, { resetKey: key }), {
      initialProps: { key: "a" },
    });
    expect(result.current.pageItems).toEqual(items.slice(0, 25));

    act(() => result.current.pagination.onPageChange(3));
    expect(result.current.pageItems).toEqual(items.slice(50, 60));

    rerender({ key: "b" });
    expect(result.current.pagination.page).toBe(1);
  });

  it("remembers the chosen page size", () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.pagination.onPageSizeChange?.(50));
    expect(result.current.pageItems).toHaveLength(50);
    expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe("50");

    const next = renderHook(() => usePagination(items));
    expect(next.result.current.pagination.pageSize).toBe(50);
  });
});

describe("Pagination", () => {
  it("renders nothing while everything fits on one small page", () => {
    const { container } = render(<Pagination page={1} pageSize={25} total={8} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the range and changes page and size", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination page={2} pageSize={25} total={60} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />,
    );
    expect(screen.getByText("26–50 von 60")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByRole("combobox", { name: "Einträge pro Seite" }), { target: { value: "100" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });
});
