import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "../select/Select";

const OPTIONS = [
  { value: "LV", label: "Lebensversicherung" },
  { value: "KV", label: "Krankenversicherung" },
  { value: "SACH", label: "Sachversicherung", disabled: true },
  { value: "GAS", label: "Gas (keine Punkte)" },
];

/** jsdom has no layout: put the field at `top` and give the list a height. */
function layout(top: number, listHeight = 160) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(listHeight);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top, bottom: top + 40, left: 100, right: 340, width: 240, height: 40, x: 100, y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

const renderSelect = (value = "GAS", onChange = vi.fn()) => {
  render(<Select label="Sparte" value={value} onChange={onChange} options={OPTIONS} />);
  return { field: screen.getByRole("combobox", { name: "Sparte" }), onChange };
};

describe("Dropdown", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens below the field even when the last option is selected", () => {
    layout(100);
    const { field } = renderSelect("GAS");
    fireEvent.click(field);
    const list = screen.getByRole("listbox").parentElement!;
    expect(list.parentElement).toBe(document.body);
    expect(list).toHaveClass("animate-slide-down");
    expect(list.style.top).toBe("144px");
    expect(screen.getByRole("option", { name: "Gas (keine Punkte)" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens upwards only when there is no room below", () => {
    layout(window.innerHeight - 60);
    const { field } = renderSelect();
    fireEvent.click(field);
    expect(screen.getByRole("listbox").parentElement).toHaveClass("animate-slide-up");
  });

  it("works with the keyboard and skips disabled options", () => {
    layout(100);
    const { field, onChange } = renderSelect("LV");
    fireEvent.keyDown(field, { key: "ArrowDown" }); // opens on the current value
    expect(field).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Lebensversicherung" }).id);
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" }); // over the disabled Sach
    expect(field).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Gas (keine Punkte)" }).id);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("GAS");
  });

  it("jumps to an option by typing its first letters", () => {
    layout(100);
    const { field } = renderSelect("LV");
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "k" });
    expect(field).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Krankenversicherung" }).id);
  });

  it("ignores clicks on disabled options", () => {
    layout(100);
    const { field, onChange } = renderSelect();
    fireEvent.click(field);
    fireEvent.click(screen.getByRole("option", { name: "Sachversicherung" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape without letting a surrounding dialog close too", () => {
    layout(100);
    const onDocumentEscape = vi.fn();
    document.addEventListener("keydown", onDocumentEscape);
    const { field } = renderSelect();
    fireEvent.click(field);
    fireEvent.keyDown(document.body, { key: "Escape" }); // focus anywhere
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(field).toHaveFocus();
    expect(onDocumentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentEscape);
  });
});
