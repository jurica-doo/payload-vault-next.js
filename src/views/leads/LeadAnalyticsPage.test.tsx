import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  perms: { employeeId: "me", isLeader: true, isAdmin: false },
  lastScope: "",
}));

const funnel = (scope: string) => ({
  window: { from: "2026-10-01", to: "2026-11-01" }, scope,
  totals: { leads: 4, contacted: 3, reached: 2, qualified: 2, booked: 2, held: 1, offer: 1, won: 1, lost: 1, open: 2, unassigned: 0 },
  first_contact: { contacted: 2, avg_hours: 5.5, median_hours: 4, within_sla: 1, overdue_open: 1 },
  by_source: [{ source_id: "s1", name: "Empfehlung", leads: 4, contacted: 3, booked: 2, won: 1, points: 10, commission: scope === "all" ? 560 : null, cost: scope === "all" ? 100 : null, cost_per_lead: scope === "all" ? 25 : null, cost_per_sale: scope === "all" ? 100 : null }],
  by_owner: [{ owner_id: "fa", name: "Fritz FA", leads: 4, contacted: 3, booked: 2, won: 1, avg_first_contact_hours: 5.5 }],
  by_stage: [{ stage: "assigned", name: "Zugewiesen", leads: 2, avg_age_days: 3 }],
  loss_reasons: [{ reason: "price", leads: 1 }],
  by_month: [{ month: "2026-10-01", leads: 4, won: 1 }],
});

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("../../hooks/useLeads/useLeads", () => ({
  useSourceTrends: () => ({ data: [] }),
  useLeadFunnel: (_f: string, _t: string, scope: string) => { state.lastScope = scope; return { data: funnel(scope), isLoading: false, error: null }; },
}));

const { LeadAnalyticsPage } = await import("./LeadAnalyticsPage");

describe("LeadAnalyticsPage", () => {
  beforeEach(() => { state.perms = { employeeId: "me", isLeader: true, isAdmin: false }; });

  it("shows every rate with numerator, denominator and definition", () => {
    render(<LeadAnalyticsPage />);
    expect(state.lastScope).toBe("team");
    expect(screen.getByText("3 von 4 · Kontakt versucht ÷ Leads")).toBeInTheDocument();
    expect(screen.getByText("1 von 2 · Termin durchgeführt ÷ vereinbart")).toBeInTheDocument();
    expect(screen.getByText(/noch ohne Erstkontakt/)).toBeInTheDocument();
  });

  it("hides costs outside the organisation view", () => {
    render(<LeadAnalyticsPage />);
    expect(screen.queryByText("Kosten/Lead")).not.toBeInTheDocument();
    expect(screen.getByText(/nur in der Gesamtansicht/)).toBeInTheDocument();
  });

  it("admins can switch to the organisation view with costs", () => {
    state.perms = { employeeId: "me", isLeader: false, isAdmin: true };
    render(<LeadAnalyticsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Gesamt" }));
    expect(state.lastScope).toBe("all");
    expect(screen.getAllByText("Kosten/Lead").length).toBeGreaterThan(0);
  });
});
