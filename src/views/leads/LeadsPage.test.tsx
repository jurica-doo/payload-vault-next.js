import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  perms: { employeeId: "me", isLeader: true, isAdmin: false },
  params: new URLSearchParams(),
  total: 4,
}));

const lead = (id: string, owner: string | null, stage: string, extra: Record<string, unknown> = {}) => ({
  id, lead_no: Number(id.replace(/\D/g, "")) || 1, first_name: null, last_name: `Kunde ${id}`, company: null, phone: null, email: null,
  owner_id: owner, stage, source_id: "s1", received_at: "2026-10-20T08:00:00Z", sla_due_at: "2026-10-21T08:00:00Z",
  first_contact_at: null, next_action: null, next_action_at: null, search_name: `kunde ${id}`, closed_at: null, ...extra,
});

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => state.params }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../hooks/useStructure/useStructure", () => ({
  useStructure: () => ({ data: { byId: new Map([["me", { first_name: "Ich", last_name: "Selbst" }], ["fa", { first_name: "Fritz", last_name: "FA" }]]) } }),
}));
vi.mock("../../hooks/useLeads/useLeads", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useLeads/useLeads")>()),
  useLeadConfig: () => ({ data: {
    stages: [
      { code: "new", name_de: "Neu", position: 10, kind: "open" },
      { code: "assigned", name_de: "Zugewiesen", position: 20, kind: "open" },
      { code: "lost", name_de: "Verloren", position: 91, kind: "lost" },
    ],
    sources: [{ id: "s1", name: "Empfehlung", kind: "referral", active: true }],
  } }),
  useLeads: () => ({ isLoading: false, error: null, data: { total: state.total, rows: [
    lead("a1", "me", "assigned"), lead("a2", "fa", "assigned"), lead("a3", null, "new"),
    lead("a4", "me", "lost", { closed_at: "2026-10-22T00:00:00Z" }),
    lead("a5", "fa", "assigned", { sla_due_at: "2099-01-01T08:00:00Z" }),
  ] } }),
}));

const { LeadsPage } = await import("./LeadsPage");

describe("LeadsPage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "me", isLeader: true, isAdmin: false };
    state.params = new URLSearchParams();
    state.total = 5;
  });

  it("shows own open leads by default with the SLA state", () => {
    render(<LeadsPage />);
    expect(screen.getAllByText("Kunde a1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Kunde a2")).not.toBeInTheDocument();
    expect(screen.getAllByText("überfällig").length).toBeGreaterThan(0);
  });

  it("has team, pool and closed views for leaders", () => {
    render(<LeadsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Nicht zugewiesen \(1\)/ }));
    expect(screen.getAllByText("Kunde a3").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: /Abgeschlossen/ }));
    expect(screen.getAllByText("Kunde a4").length).toBeGreaterThan(0);
  });

  it("advisers have no team or pool tabs", () => {
    state.perms = { employeeId: "me", isLeader: false, isAdmin: false };
    render(<LeadsPage />);
    expect(screen.queryByRole("tab", { name: /Team/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Nicht zugewiesen/ })).not.toBeInTheDocument();
  });

  it("P4-NOTIF-01 opens the view from the digest link (?ansicht=team&sla=overdue)", () => {
    state.params = new URLSearchParams("ansicht=team&sla=overdue");
    render(<LeadsPage />);
    expect(screen.getByRole("tab", { name: /Team \(1\)/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Kunde a2").length).toBeGreaterThan(0);
    expect(screen.queryByText("Kunde a5")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Nur überfällige" })).toBeChecked();
  });

  it("P4-PERF-02 says when the list is cut off", () => {
    state.total = 1506;
    render(<LeadsPage />);
    expect(screen.getByText(/neuesten 5 von 1.506 Leads/)).toBeInTheDocument();
  });

  it("P4-UX-02 an admin without a team sees 'Alle anderen'", () => {
    state.perms = { employeeId: "me", isLeader: false, isAdmin: true };
    render(<LeadsPage />);
    expect(screen.getByRole("tab", { name: /Alle anderen/ })).toBeInTheDocument();
  });
});
