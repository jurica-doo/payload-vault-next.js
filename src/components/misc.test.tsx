import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditTimeline } from "./auditTimeline/AuditTimeline";
import { CalculationBreakdown } from "./calculationBreakdown/CalculationBreakdown";
import { FunnelChart } from "./charts/FunnelChart";
import { periodToRange } from "./periodSelector/PeriodSelector";
import { StageStepper } from "./stageStepper/StageStepper";

describe("AuditTimeline", () => {
  it("shows actor, Berlin time, reason and old → new", () => {
    render(
      <AuditTimeline
        entries={[
          {
            id: "1",
            at: "2026-10-26T09:00:00Z",
            actorName: null,
            action: "hat die Führungskraft geändert",
            reason: "Teamwechsel",
            changes: [{ field: "manager_id", label: "Führungskraft", from: "Tim", to: "Dora" }],
          },
        ]}
      />,
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("26.10.2026, 10:00")).toBeInTheDocument(); // CET after DST end
    expect(screen.getByText("Teamwechsel")).toBeInTheDocument();
    expect(screen.getByText("Tim")).toBeInTheDocument();
  });

  it("renders an empty message", () => {
    render(<AuditTimeline entries={[]} />);
    expect(screen.getByText("Keine Änderungen protokolliert.")).toBeInTheDocument();
  });
});

describe("CalculationBreakdown", () => {
  it("shows inputs, formula, result and rule version (§14.1)", () => {
    render(
      <CalculationBreakdown
        inputs={[
          { label: "Monatsbeitrag", value: "100,00 €" },
          { label: "Laufzeit", value: "35 Jahre" },
        ]}
        formula="100 × 12 × 35 ÷ 4.000"
        result={{ label: "Punkte", value: "10,50 P" }}
        ruleVersion="LV 2026-01"
      />,
    );
    expect(screen.getByText("100 × 12 × 35 ÷ 4.000")).toBeInTheDocument();
    expect(screen.getByText("10,50 P")).toBeInTheDocument();
    expect(screen.getByText("Regelversion: LV 2026-01")).toBeInTheDocument();
  });
});

describe("FunnelChart", () => {
  it("states rates relative to the previous step and the window (§8.2 example)", () => {
    render(
      <FunnelChart
        window="Oktober 2026"
        steps={[
          { id: "held", label: "Termine gehalten", count: 20 },
          { id: "sale", label: "Abschlüsse", count: 8 },
        ]}
      />,
    );
    expect(screen.getByText(/40\s%\svon 20/)).toBeInTheDocument();
    expect(screen.getByText(/Zeitraum: Oktober 2026/)).toBeInTheDocument();
  });

  it("shows a dash instead of NaN when a step is 0", () => {
    render(
      <FunnelChart
        window="x"
        steps={[
          { id: "a", label: "A", count: 0 },
          { id: "b", label: "B", count: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/– von 0/)).toBeInTheDocument();
  });
});

describe("StageStepper", () => {
  const stages = [
    { id: "new", label: "Neu" },
    { id: "contacted", label: "Kontaktiert" },
    { id: "offer", label: "Angebot" },
  ];

  it("marks done and current stages", () => {
    render(<StageStepper stages={stages} currentId="contacted" />);
    expect(screen.getByText("Kontaktiert").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Neu").closest("li")).toHaveAttribute("data-state", "done");
  });

  it("replaces the remaining path with a terminal outcome", () => {
    render(<StageStepper stages={stages} currentId="contacted" outcome={{ label: "Verloren", tone: "error" }} />);
    expect(screen.queryByText("Angebot")).not.toBeInTheDocument();
    expect(screen.getByText("Verloren")).toBeInTheDocument();
  });
});

describe("periodToRange", () => {
  it("returns half-open ranges", () => {
    expect(periodToRange({ kind: "month", year: 2026, month: 12 })).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(periodToRange({ kind: "month", year: 2028, month: 2 })).toEqual({ start: "2028-02-01", end: "2028-03-01" });
    expect(periodToRange({ kind: "year", year: 2027 })).toEqual({ start: "2027-01-01", end: "2028-01-01" });
  });

  it("makes an inclusive custom range half-open, across leap day", () => {
    expect(periodToRange({ kind: "range", from: "2028-02-01", to: "2028-02-29" })).toEqual({
      start: "2028-02-01",
      end: "2028-03-01",
    });
  });

  it("rejects an inverted or incomplete range", () => {
    expect(periodToRange({ kind: "range", from: "2026-12-01", to: "2026-11-01" })).toBeNull();
    expect(periodToRange({ kind: "range", from: "", to: "2026-11-01" })).toBeNull();
  });

  it("looks up career periods and returns null when unknown", () => {
    const periods = [{ id: "p1", label: "1. Karrierejahr", start: "2026-11-01", end: "2027-11-01" }];
    expect(periodToRange({ kind: "career", periodId: "p1" }, periods)).toEqual({ start: "2026-11-01", end: "2027-11-01" });
    expect(periodToRange({ kind: "career", periodId: "zz" }, periods)).toBeNull();
  });
});
