import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  perms: { employeeId: "me", isLeader: true, isAdmin: false, isCompliance: false },
  total: 4,
}));

const customer = (id: string, owner: string, extra: Record<string, unknown> = {}) => ({
  id, customer_no: 1, first_name: null, last_name: `Kunde ${id}`, company: null, owner_id: owner, status: "active",
  city: null, phone: null, email: null, postal_code: null, search_name: `kunde ${id}`, archived_at: null, erased_at: null,
  next_follow_up_at: null, ...extra,
});

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
vi.mock("../../hooks/useStructure/useStructure", () => ({ useStructure: () => ({ data: { byId: new Map() } }) }));
vi.mock("../../hooks/useCustomers/useCustomers", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useCustomers/useCustomers")>()),
  useCustomers: () => ({ isLoading: false, error: null, data: { total: state.total, rows: [
    customer("a1", "me"), customer("a2", "fa"), customer("a3", "me", { archived_at: "2026-10-01T00:00:00Z" }),
    customer("a4", "fa", { erased_at: "2026-10-02T00:00:00Z", last_name: null }),
  ] } }),
}));

const { CustomersPage } = await import("./CustomersPage");

describe("CustomersPage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "me", isLeader: true, isAdmin: false, isCompliance: false };
    state.total = 4;
  });

  it("shows own active customers first", () => {
    render(<CustomersPage />);
    expect(screen.getAllByText("Kunde a1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Kunde a2")).not.toBeInTheDocument();
    expect(screen.queryByText("Kunde a3")).not.toBeInTheDocument();
  });

  it("team and archive views; erased customers stay pseudonymised", () => {
    render(<CustomersPage />);
    fireEvent.click(screen.getByRole("tab", { name: /^Team/ }));
    expect(screen.getAllByText("Kunde a2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gelöscht (pseudonymisiert)").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: /^Archiviert/ }));
    expect(screen.getAllByText("Kunde a3").length).toBeGreaterThan(0);
  });

  it("compliance without an employee record sees all, read-only", () => {
    state.perms = { employeeId: null as unknown as string, isLeader: false, isAdmin: false, isCompliance: true };
    render(<CustomersPage />);
    expect(screen.getByRole("tab", { name: /^Alle \(/ })).toBeInTheDocument();
    expect(screen.queryByText("Kunde anlegen")).not.toBeInTheDocument();
  });

  it("P5-PERF-01 says when only part of the customers is shown", () => {
    state.total = 2508;
    render(<CustomersPage />);
    expect(screen.getByText(/4 von 2.508 Kunden/)).toBeInTheDocument();
  });

  it("P5-UX-09 tabs show their counts", () => {
    render(<CustomersPage />);
    expect(screen.getByRole("tab", { name: "Meine Kunden (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Team (2)" })).toBeInTheDocument();
  });
});
