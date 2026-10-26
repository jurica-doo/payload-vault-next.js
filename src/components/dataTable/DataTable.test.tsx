import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";
import type { DataTableColumn } from "./DataTable.types";
import { nextSort, pageCount, sortRows } from "./DataTable.utils";

type Row = { id: string; name: string; points: number | null };

const rows: Row[] = [
  { id: "1", name: "Özil", points: 10 },
  { id: "2", name: "Abel", points: null },
  { id: "3", name: "Zander", points: 2 },
  { id: "4", name: "Bauer", points: 10 },
];

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
  { id: "points", header: "Punkte", cell: (r) => r.points ?? "–", sortValue: (r) => r.points, align: "right" },
];

const desktopNames = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("DataTable utils", () => {
  it("cycles sort asc → desc → none", () => {
    expect(nextSort(null, "a")).toEqual({ columnId: "a", direction: "asc" });
    expect(nextSort({ columnId: "a", direction: "asc" }, "a")).toEqual({ columnId: "a", direction: "desc" });
    expect(nextSort({ columnId: "a", direction: "desc" }, "a")).toBeNull();
    expect(nextSort({ columnId: "a", direction: "desc" }, "b")).toEqual({ columnId: "b", direction: "asc" });
  });

  it("sorts German names with umlauts correctly and keeps ties stable", () => {
    const byName = sortRows(rows, columns, { columnId: "name", direction: "asc" }).map((r) => r.name);
    expect(byName).toEqual(["Abel", "Bauer", "Özil", "Zander"]);
    const byPoints = sortRows(rows, columns, { columnId: "points", direction: "desc" }).map((r) => r.id);
    expect(byPoints).toEqual(["1", "4", "3", "2"]); // tie 1/4 keeps order, null last
  });

  it("keeps nulls last in both directions", () => {
    const asc = sortRows(rows, columns, { columnId: "points", direction: "asc" });
    expect(asc[asc.length - 1].id).toBe("2");
  });

  it("computes page counts", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });
});

describe("DataTable", () => {
  it("sorts locally when uncontrolled and sets aria-sort", () => {
    render(<DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />);
    const header = within(screen.getByRole("table")).getByRole("button", { name: /Name/ });
    fireEvent.click(header);
    expect(desktopNames()).toEqual(["Abel", "Bauer", "Özil", "Zander"]);
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
  });

  it("delegates sorting when controlled", () => {
    const onSortChange = vi.fn();
    render(
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} sort={null} onSortChange={onSortChange} />,
    );
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /Punkte/ }));
    expect(onSortChange).toHaveBeenCalledWith({ columnId: "points", direction: "asc" });
    expect(desktopNames()).toEqual(["Özil", "Abel", "Zander", "Bauer"]); // unchanged
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<DataTable rows={[]} columns={columns} getRowId={(r) => r.id} isLoading />);
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(5);
    rerender(<DataTable rows={rows} columns={columns} getRowId={(r) => r.id} error="Laden fehlgeschlagen" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Laden fehlgeschlagen");
    rerender(<DataTable rows={[]} columns={columns} getRowId={(r) => r.id} emptyMessage="Keine Leads" />);
    expect(screen.getByText("Keine Leads")).toBeInTheDocument();
  });

  it("paginates and disables out-of-range buttons", () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        pagination={{ page: 1, pageSize: 2, total: 5, onPageChange }}
      />,
    );
    expect(screen.getByText("1–2 von 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zurück" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("supports keyboard row activation", () => {
    const onRowClick = vi.fn();
    render(<DataTable rows={rows} columns={columns} getRowId={(r) => r.id} onRowClick={onRowClick} />);
    const firstRow = within(screen.getByRole("table")).getAllByRole("row")[1];
    fireEvent.keyDown(firstRow, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
