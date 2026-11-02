import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu";

/** jsdom has no layout: place the trigger and give the menu a height. */
function layout(triggerTop: number, menuHeight = 120) {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(menuHeight);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: triggerTop, bottom: triggerTop + 32, left: 900, right: 932, width: 32, height: 32, x: 900, y: triggerTop,
    toJSON: () => ({}),
  } as DOMRect);
}

const items = [
  { label: "Stufe ändern", onClick: vi.fn() },
  { label: "Deaktivieren", onClick: vi.fn(), danger: true },
];

describe("ActionMenu", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders the menu above the page, outside any scroll box", () => {
    layout(100);
    const { container } = render(
      <div style={{ overflow: "auto" }}>
        <ActionMenu items={items} label="Aktionen für Laura Becker" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aktionen für Laura Becker" }));
    const menu = screen.getByRole("menu");
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass("fixed", "animate-slide-down");
    expect(menu.style.top).toBe("136px"); // below the trigger
  });

  it("opens upwards when there is no room below", () => {
    layout(window.innerHeight - 40);
    render(<ActionMenu items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Weitere Aktionen" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("animate-slide-up");
    expect(menu.style.top).toBe(`${window.innerHeight - 40 - 4 - 120}px`);
  });

  it("runs an item and closes on outside click or Escape", () => {
    layout(100);
    render(<ActionMenu items={items} />);
    const trigger = screen.getByRole("button", { name: "Weitere Aktionen" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Stufe ändern" }));
    expect(items[0].onClick).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
