import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrencyInput, parseGermanDecimal } from "./FormFields";
import { ReasonConfirmForm } from "../reasonConfirm/ReasonConfirmForm";

describe("parseGermanDecimal", () => {
  it.each([
    ["10,5", "10.5"],
    ["1.234,56", "1234.56"],
    ["1.234", "1234"],
    ["1.000.000", "1000000"],
    ["700", "700"],
    ["0.5", "0.5"],
    ["-28,00", "-28.00"],
    [" 1 234,5 ", "1234.5"],
  ])("parses %j as %j", (input, expected) => {
    expect(parseGermanDecimal(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "1e5", "12,", ",5", "--1"])("rejects %j", (input) => {
    expect(parseGermanDecimal(input)).toBeNull();
  });
});

describe("CurrencyInput", () => {
  it("links the label and shows the euro suffix", () => {
    const onChange = vi.fn();
    render(<CurrencyInput label="Beitrag" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Beitrag");
    expect(input).toHaveAttribute("inputmode", "decimal");
    fireEvent.change(input, { target: { value: "100,00" } });
    expect(onChange).toHaveBeenCalledWith("100,00");
    expect(screen.getByText("€")).toBeInTheDocument();
  });

  it("marks errors for assistive tech", () => {
    render(<CurrencyInput label="Beitrag" value="x" onChange={() => {}} error="Keine Zahl" />);
    expect(screen.getByLabelText("Beitrag")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Keine Zahl")).toBeInTheDocument();
  });
});

describe("ReasonConfirmForm", () => {
  it("rejects a too-short or whitespace reason", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReasonConfirmForm message="Lead neu zuweisen?" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Begründung/), { target: { value: "   kurz    " } });
    fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
    expect(await screen.findByText("Bitte mindestens 10 Zeichen angeben.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("passes the trimmed reason", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReasonConfirmForm message="?" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Begründung/), { target: { value: "  Urlaub des Betreuers  " } });
    fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Urlaub des Betreuers"));
  });

  it("shows the server error and stays open", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Keine Berechtigung"));
    render(<ReasonConfirmForm message="?" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Begründung/), { target: { value: "Ausreichend lange Begründung" } });
    fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
    expect(await screen.findByText("Keine Berechtigung")).toBeInTheDocument();
  });
});
