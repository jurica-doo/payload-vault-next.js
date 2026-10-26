import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hasMfa: true }));
const employees = [
  {
    id: "e1", user_id: "me", employee_no: "P00001", first_name: "Ada", last_name: "Admin",
    email: "ada@test.local", status: "active", start_date: "2026-01-01", roles: ["admin"], openInvite: false, levelCode: "VD",
  },
  {
    id: "e2", user_id: null, employee_no: "P00002", first_name: "Nora", last_name: "Neu",
    email: "nora@test.local", status: "invited", start_date: "2026-11-01", roles: [], openInvite: false, levelCode: null,
  },
  {
    id: "e3", user_id: "u3", employee_no: "P00003", first_name: "Fritz", last_name: "Berater",
    email: "fritz@test.local", status: "inactive", start_date: "2025-01-01", roles: [], openInvite: false, levelCode: "FB",
  },
];

const mutation = { mutateAsync: vi.fn(), isPending: false };
vi.mock("../../hooks/useEmployees/useEmployees", () => ({
  useEmployees: () => ({
    data: employees, isLoading: false, error: null,
    createEmployee: mutation, resendInvite: mutation, setActive: mutation, setRole: mutation, setLevel: mutation,
  }),
}));
vi.mock("../../hooks/permissions/usePermissions", () => ({
  usePermissions: () => ({ permissions: { isAdmin: true, hasMfa: state.hasMfa } }),
}));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" } }) }));

const { EmployeesAdminPage } = await import("./EmployeesAdminPage");

const row = (name: string) => within(screen.getByRole("table")).getByText(name).closest("tr")!;

describe("EmployeesAdminPage", () => {
  beforeEach(() => {
    state.hasMfa = true;
  });

  it("lists employees with status and expired-invite hint", () => {
    render(<EmployeesAdminPage />);
    expect(within(row("Neu, Nora")).getByText("Eingeladen")).toBeInTheDocument();
    expect(within(row("Neu, Nora")).getByText("Einladung abgelaufen")).toBeInTheDocument();
    expect(within(row("Berater, Fritz")).getByRole("button", { name: "Reaktivieren" })).toBeEnabled();
  });

  it("never offers to deactivate yourself", () => {
    render(<EmployeesAdminPage />);
    expect(within(row("Admin, Ada")).queryByRole("button", { name: "Deaktivieren" })).not.toBeInTheDocument();
  });

  it("disables every write action and explains why without MFA", () => {
    state.hasMfa = false;
    render(<EmployeesAdminPage />);
    expect(screen.getByRole("note")).toHaveTextContent("Zwei-Faktor-Anmeldung erforderlich");
    expect(screen.getByRole("button", { name: "Mitarbeitende anlegen" })).toBeDisabled();
    expect(within(row("Neu, Nora")).getByRole("button", { name: "Einladung senden" })).toBeDisabled();
    expect(within(row("Berater, Fritz")).getByRole("button", { name: "Reaktivieren" })).toBeDisabled();
  });

  it("flags a missing level", () => {
    render(<EmployeesAdminPage />);
    expect(within(row("Neu, Nora")).getByText("fehlt")).toBeInTheDocument();
    expect(within(row("Admin, Ada")).getByText("VD")).toBeInTheDocument();
  });

  it("shows roles only for linked accounts", () => {
    render(<EmployeesAdminPage />);
    expect(within(row("Neu, Nora")).getByText("nach Annahme")).toBeInTheDocument();
    expect(within(row("Admin, Ada")).getByRole("button", { name: "Administration" })).toHaveAttribute("aria-pressed", "true");
  });
});
