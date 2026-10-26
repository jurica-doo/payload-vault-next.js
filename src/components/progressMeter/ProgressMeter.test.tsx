import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressMeter } from "./ProgressMeter";
import { KpiTile } from "../kpiTile/KpiTile";

describe("ProgressMeter", () => {
  it("shows the FB candidate from §14.4: 7 of 10 KV points", () => {
    render(<ProgressMeter label="KV-Punkte" achieved="7" required="10" unit="KV-P" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByText("Noch 3,00 KV-P")).toBeInTheDocument();
  });

  it("caps the bar at 100 % but shows the real value", () => {
    render(<ProgressMeter label="Punkte" achieved="120" required="100" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("120,00 / 100,00 P")).toBeInTheDocument();
    expect(screen.getByText("Erreicht")).toBeInTheDocument();
  });

  it("handles a missing or zero requirement without dividing by zero", () => {
    render(<ProgressMeter label="Punkte" achieved="5" required="0" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("never goes below 0 for negative (reversed) totals", () => {
    render(<ProgressMeter label="Punkte" achieved="-5" required="100" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("draws cap markers and pace", () => {
    render(
      <ProgressMeter
        label="OL-Ziel"
        achieved="300"
        required="750"
        markers={[{ value: "375", label: "50 %-Grenze je Struktur" }]}
        expected="400"
      />,
    );
    expect(screen.getAllByTestId("progress-marker")).toHaveLength(1);
    expect(screen.getByText("Hinter Plan")).toBeInTheDocument();
  });
});

describe("KpiTile", () => {
  it("shows a good increase in green", () => {
    render(<KpiTile label="Punkte" value="42" delta={{ ratio: 0.12, comparedTo: "ggü. Vormonat" }} />);
    expect(screen.getByText(/12 %/)).toHaveClass("text-color-success-text");
  });

  it("treats an increase as bad when goodWhen is down", () => {
    render(
      <KpiTile label="Überfällig" value="5" delta={{ ratio: 0.5, comparedTo: "ggü. Vorwoche", goodWhen: "down" }} />,
    );
    expect(screen.getByText(/50 %/)).toHaveClass("text-color-error-text");
  });

  it("says there is no comparison instead of showing NaN", () => {
    render(<KpiTile label="Punkte" value="0" delta={{ ratio: null, comparedTo: "ggü. Vormonat" }} />);
    expect(screen.getByText("Kein Vergleich ggü. Vormonat")).toBeInTheDocument();
  });

  it("labels estimates", () => {
    render(<KpiTile label="Prognose" value="80" isEstimate />);
    expect(screen.getByText("Schätzung")).toBeInTheDocument();
  });
});
