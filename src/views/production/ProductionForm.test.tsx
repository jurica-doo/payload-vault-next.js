import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseRules } from "../../domain/rules";
import { SEEDED_RULES_PAYLOAD } from "../../domain/__fixtures__/seededRules";

const rules = parseRules(SEEDED_RULES_PAYLOAD);
vi.mock("../../hooks/useRules/useRules", () => ({ useRules: () => ({ data: rules, isLoading: false }) }));

const { ProductionForm } = await import("./ProductionForm");

const renderForm = (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
  render(<ProductionForm producerId="e1" employees={[]} onSubmit={onSubmit} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText("Produktionsdatum", { exact: false }), { target: { value: "2026-06-01" } });
  return onSubmit;
};

describe("ProductionForm", () => {
  it("previews LV points live (GC-POINTS-001 inputs)", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Beitrag/), { target: { value: "100,00" } });
    fireEvent.change(screen.getByLabelText(/Laufzeit/), { target: { value: "35" } });
    // Shown in the preview line and again in the expandable breakdown.
    expect(screen.getAllByText("10,50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("294")).toBeInTheDocument();
  });

  it("shows the net/gross choice only for Sach and explains a gross premium", () => {
    renderForm();
    expect(screen.queryByLabelText(/Netto\/Brutto/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Sparte/), { target: { value: "SACH" } });
    fireEvent.change(screen.getByLabelText(/Beitrag/), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/Netto\/Brutto/), { target: { value: "gross" } });
    expect(screen.getByText(/Jahresnettobeitrag benötigt/)).toBeInTheDocument();
  });

  it("flags a capped LV term with the open decision", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Beitrag/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/Laufzeit/), { target: { value: "40" } });
    expect(screen.getByRole("note")).toHaveTextContent("OD-06");
  });

  it("refuses to submit a non-number and sends a normalised decimal otherwise", async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(/Sparte/), { target: { value: "KV" } });
    fireEvent.change(screen.getByLabelText(/Beitrag/), { target: { value: "sieben" } });
    fireEvent.click(screen.getByRole("button", { name: "Als Entwurf speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("als Zahl");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Beitrag/), { target: { value: "1.234,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern & einreichen" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ categoryCode: "KV", premiumAmount: "1234.50", termYears: null });
    expect(onSubmit.mock.calls[0][1]).toBe(true);
  });
});
