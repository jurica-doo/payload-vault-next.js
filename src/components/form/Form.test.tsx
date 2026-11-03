import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../button/Button";
import { Form } from "./Form";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("Form", () => {
  it("P4-R2-01 a double submit calls the handler once while it runs", async () => {
    const d = deferred();
    const onSubmit = vi.fn(() => d.promise);
    render(<Form onSubmit={onSubmit}><Button type="submit" text="Speichern" /></Form>);
    const button = screen.getByRole("button", { name: "Speichern" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(button.closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => { d.resolve(); await d.promise; });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("a failing submit releases the guard", async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error("x")).catch(() => undefined));
    render(<Form onSubmit={onSubmit}><Button type="submit" text="Speichern" /></Form>);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("Button", () => {
  it("P4-R2-01 an async onClick runs once on a double click", async () => {
    const d = deferred();
    const onClick = vi.fn(() => d.promise);
    render(<Button text="Planen" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Planen" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () => { d.resolve(); await d.promise; });
    expect(button).not.toBeDisabled();
  });

  it("a plain onClick still fires every time", () => {
    const onClick = vi.fn();
    render(<Button text="Weiter" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
