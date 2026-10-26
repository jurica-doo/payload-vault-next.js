import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  perms: { employeeId: "me", isLeader: false, isAdmin: false, isFinance: false },
}));

const me = {
  month: "2026-10-01",
  as_of: "2026-10-26",
  production: { points: "15", kv_points: "5", ae: "420" },
  year: { points: "120", kv_points: "20", ae: "3360" },
  trend: [{ month: "2026-05-01", points: 0 }, { month: "2026-10-01", points: 15 }],
  goal: { status: "approved", targets: { points: 20, appointments_held: 4 } },
  career: { status: "in_progress", reason: null, level: "FA", target: "FB", eligible: "80", required: "100", eligible_kv: "5", kv_required: "10", expected_now: "82", period_end: "2027-01-01", window_start: "2026-01-01" },
  commission: { gross: "420", net: "378" },
  todo: { drafts: 2, goal_missing: false, goals_to_review: 0 },
};
const team = {
  month: "2026-10-01", team_size: 3, structure_total: { points: "30", kv_points: "0", ae: "840" },
  direct_reports: [{ employee_id: "fb", name: "Fritz FB", status: "active", level: "FB", own: { points: "20" }, structure: { points: "10" }, team_size: 1, goal: null, career_status: "ready" }],
};
const admin = {
  without_level: [{ id: "x", name: "Lena Lose" }], without_assignment: [], expired_invites: 0, production_to_confirm: 4,
  open_exceptions: 0, goals_to_review: 0, unapproved_past_months: [],
};

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("../../hooks/useDashboard/useDashboard", () => ({
  useMyDashboard: (on: boolean) => ({ data: on ? me : undefined, isLoading: false }),
  useTeamDashboard: (on: boolean) => ({ data: on ? team : undefined }),
  useAdminDashboard: (on: boolean) => ({ data: on ? admin : undefined }),
}));
vi.mock("../../hooks/useCoaching/useCoaching", () => ({
  useCoaching: () => ({ data: { actions: [{ id: "a1", title: "Zwei KV-Termine", status: "open", owner_id: "me", due_on: "2026-11-01" }] }, setActionStatus: { mutate: vi.fn() } }),
}));
vi.mock("../../hooks/useActivities/useActivities", () => ({
  useActivitySummary: () => ({ data: { contact_attempts: 9, reached: 4, appointments_booked: 5, appointments_held: 3, no_shows: 1, offers: 2, followups: 1, upcoming_appointments: 2 } }),
}));
vi.mock("../../hooks/useLeads/useLeads", () => ({
  useTeamSignals: () => ({ data: [{ code: "overdue_tasks", severity: "warning", name: "Fritz FB", count: 6 }] }),
}));
vi.mock("../../components/charts/TrendChart", () => ({ TrendChart: ({ caption }: { caption: string }) => <figure>{caption}</figure> }));

const { DashboardPage } = await import("./DashboardPage");

describe("DashboardPage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "me", isLeader: false, isAdmin: false, isFinance: false };
  });

  it("shows month KPIs against the goal", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Mein Monat")).toBeInTheDocument();
    expect(screen.getByText(/25\s%\sggü\. Ziel 20 P/)).toBeInTheDocument(); // 15 vs 20 → −25 %
  });

  it("shows activity counts against the goal's activity targets", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Termine durchgeführt")).toBeInTheDocument();
    expect(screen.getByText(/25\s%\sggü\. Ziel 4$/)).toBeInTheDocument(); // 3 vs 4 → −25 %
    expect(screen.getByText("1 nicht erschienen")).toBeInTheDocument();
  });

  it("shows the employee's agreed coaching actions", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Vereinbarte Maßnahmen")).toBeInTheDocument();
    expect(screen.getByText("Zwei KV-Termine")).toBeInTheDocument();
  });

  it("labels forecasts as estimates and states the method (§7.5)", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Prognose Monatsende")).toBeInTheDocument();
    expect(screen.getByText(/Hochrechnung: bisheriges Tempo \(26 von 31 Tagen\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lineare Hochrechnung bis Periodenende/)).toBeInTheDocument();
  });

  it("lists open to-dos with links", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/2 Produktions-Entwürfe/)).toBeInTheDocument();
    expect(screen.queryByText(/kein Ziel angelegt/)).not.toBeInTheDocument();
  });

  it("shows trend prompts with their numbers to leaders", () => {
    state.perms = { ...state.perms, isLeader: true };
    render(<DashboardPage />);
    expect(screen.getByText(/Fritz FB: 6 Aufgaben/)).toBeInTheDocument();
  });

  it("adds the team section for leaders only", () => {
    render(<DashboardPage />);
    expect(screen.queryByText("Meine Struktur")).not.toBeInTheDocument();
    state.perms.isLeader = true;
    render(<DashboardPage />);
    expect(screen.getByText("Meine Struktur")).toBeInTheDocument();
    expect(screen.getByText("qualifiziert")).toBeInTheDocument();
  });

  it("shows only non-zero data-quality items for admins", () => {
    state.perms.isAdmin = true;
    render(<DashboardPage />);
    expect(screen.getByText(/1 aktive Personen ohne Karrierestufe/)).toBeInTheDocument();
    expect(screen.getByText("Lena Lose")).toBeInTheDocument();
    expect(screen.getByText(/4 eingereichte Verträge/)).toBeInTheDocument();
    expect(screen.queryByText(/abgelaufene Einladungen/)).not.toBeInTheDocument();
  });
});
