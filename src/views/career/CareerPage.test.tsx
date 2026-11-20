import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ progress: null as unknown }));
vi.mock("../../hooks/useCareer/useCareer", () => ({
  useCareerProgress: () => ({ data: state.progress, isLoading: false, error: null }),
}));
vi.mock("../../hooks/useStructure/useStructure", () => ({ useStructure: () => ({ data: undefined }) }));
vi.mock("../../hooks/permissions/usePermissions", () => ({
  usePermissions: () => ({ permissions: { isLeader: false, isAdmin: false, employeeId: "e1" } }),
}));

const { CareerPage } = await import("./CareerPage");

const tlTowardsOl = {
  status: "in_progress",
  employee_id: "e1",
  as_of: "2026-10-26",
  level: "TL",
  target: "OL",
  required: "750",
  kv_required: "75.0000",
  cap_value: "375.00",
  personal: { points: "100", kv: "0" },
  structures: [
    { id: "s1", name: "Fritz Berater", gross: "800", gross_kv: "80", eligible: "375", eligible_kv: "37.5000", cap_applied: true },
    { id: "s2", name: "Tara Team", gross: "300", gross_kv: "40", eligible: "300", eligible_kv: "40.0000", cap_applied: false },
  ],
  eligible: "775",
  eligible_kv: "77.5000",
  points_missing: "0",
  kv_missing: "0",
  own_required: null,
  own_missing: "0",
  own_ok: true,
  retention: { settled: "1210", cancelled: "10", ratio: "0.9917", required: "0.9000", ok: true },
  is_ready: true,
  window: { start: "2026-05-01", end: "2027-01-01" },
  period: { type: "first_personal", start: "2026-01-01", end: "2027-01-01" },
  expected_now: "600",
};

describe("CareerPage", () => {
  beforeEach(() => {
    state.progress = tlTowardsOl;
  });

  it("shows target, period with inclusive last day, and the restart after a level change", () => {
    render(<CareerPage />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("TL → OL");
    expect(screen.getByText(/01\.01\.2026 – 31\.12\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/gezählt ab 01\.05\.2026/)).toBeInTheDocument();
    expect(screen.getByText("Qualifiziert – Freigabe ausstehend")).toBeInTheDocument();
  });

  it("shows where points come from and marks the capped structure", () => {
    render(<CareerPage />);
    const capped = screen.getByText(/Struktur Fritz Berater/, { selector: "td" }).closest("tr")!;
    expect(capped).toHaveTextContent("begrenzt");
    expect(capped).toHaveTextContent("800,00");
    expect(capped).toHaveTextContent("375,00");
    expect(screen.getByText(/Struktur Tara Team/, { selector: "td" }).closest("tr")).not.toHaveTextContent("begrenzt");
  });

  it("shows the retention rate and no provisional notices (rules confirmed by Profina)", () => {
    render(<CareerPage />);
    expect(screen.getByText(/Nachhaltigkeitsquote/)).toHaveTextContent("99,2 %");
    expect(screen.getByText(/Nachhaltigkeitsquote/)).toHaveTextContent("10,00 P storniert");
    expect(screen.getByText("erfüllt")).toBeInTheDocument();
    expect(screen.queryByText(/OD-0/)).not.toBeInTheDocument();
  });

  it("shows the own-business minimum when the target asks for it", () => {
    state.progress = { ...tlTowardsOl, target: "TL", required: "300", own_required: "60", own_missing: "40", own_ok: false,
      personal: { points: "20", kv: "0" }, is_ready: false };
    render(<CareerPage />);
    expect(screen.getByText("davon eigene Produktion")).toBeInTheDocument();
  });

  it("explains a window that starts on 1 January after the personal year", () => {
    state.progress = { ...tlTowardsOl, period: { type: "transition", start: "2027-11-01", end: "2028-01-01" },
      window: { start: "2027-01-01", end: "2028-01-01" } };
    render(<CareerPage />);
    expect(screen.getByText(/gezählt ab 01\.01\.2027 \(ganzes Kalenderjahr\)/)).toBeInTheDocument();
  });

  it("offers a simulation with the remaining gap and structure headroom", () => {
    render(<CareerPage />);
    expect(screen.getByText("Schätzung – wird nicht gespeichert")).toBeInTheDocument();
    expect(screen.getByText(/Struktur Fritz Berater: Grenze erreicht/)).toBeInTheDocument();
    // Only the strongest structure is limited (Profina 2026-11).
    expect(screen.getByText(/Struktur Tara Team: zählt vollständig/)).toBeInTheDocument();
    expect(screen.getByText(/wäre die Qualifikation für OL erreicht/)).toBeInTheDocument();
  });

  it("explains a blocked calculation instead of showing zeros", () => {
    state.progress = { status: "blocked", reason: "no_level" };
    render(<CareerPage />);
    expect(screen.getByText(/noch keine Karrierestufe hinterlegt/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("handles the top level", () => {
    state.progress = { status: "top_level", level: "VD" };
    render(<CareerPage />);
    expect(screen.getByText(/Höchste Stufe erreicht \(Vertriebsdirektor\)/)).toBeInTheDocument();
  });
});
