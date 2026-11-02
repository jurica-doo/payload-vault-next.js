import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollX } from "./ScrollX";

/** jsdom has no layout: fake a 1000 px wide table in a 400 px viewport. */
function fakeOverflow(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}

describe("ScrollX", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows no scroll bar when the content fits", () => {
    fakeOverflow(400, 400);
    render(<ScrollX label="Liste"><table /></ScrollX>);
    expect(screen.queryByRole("button", { name: "Nach rechts scrollen" })).not.toBeInTheDocument();
  });

  it("offers arrows and a focusable region when the content overflows", () => {
    fakeOverflow(1000, 400);
    render(<ScrollX label="Mitarbeitende"><table /></ScrollX>);
    const region = screen.getByRole("region", { name: "Mitarbeitende" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Nach links scrollen" })).toBeDisabled();

    const scrollBy = vi.fn();
    region.scrollBy = scrollBy;
    fireEvent.click(screen.getByRole("button", { name: "Nach rechts scrollen" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 320, behavior: "smooth" });
  });

  it("turns Shift + mouse wheel into sideways scrolling", () => {
    fakeOverflow(1000, 400);
    render(<ScrollX label="Liste"><table /></ScrollX>);
    const region = screen.getByRole("region", { name: "Liste" });
    fireEvent.wheel(region, { deltaY: 120, shiftKey: true });
    expect(region.scrollLeft).toBe(120);
    fireEvent.wheel(region, { deltaY: 120 });
    expect(region.scrollLeft).toBe(120);
  });
});
