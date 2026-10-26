import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  perms: { employeeId: "e1", isFinance: false, isAdmin: false, hasMfa: true },
  periodStatus: "open",
}));

const statement = {
  employee_id: "e1",
  month: "2026-10-01",
  period_status: "open",
  buckets: {
    personal: { gross: 560, reserve: 56, net: 504, entries: 1 },
    direct: { gross: 280, reserve: 28, net: 252, entries: 1 },
    indirect: { gross: 0, reserve: 0, net: 0, entries: 0 },
  },
  total: { gross: 840, reserve: 84, net: 756, entries: 2 },
  subsidy: { approved: 400, max: 500, note: "gedeckt", override: false },
};

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("../../hooks/useEmployees/useEmployees", () => ({ useEmployees: () => ({ data: [] }) }));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
const m = { mutateAsync: vi.fn(), isPending: false };
vi.mock("../../hooks/useCommission/useCommission", () => ({
  useStatement: () => ({ data: statement, isLoading: false, error: null }),
  useLedgerEntries: () => ({ data: [], isLoading: false }),
  useFinance: () => ({
    overview: { data: [], isLoading: false, error: null },
    period: { data: state.periodStatus },
    exceptions: { data: [] },
    setStatus: m, setSubsidy: m, retry: m, dismiss: m,
  }),
  logExport: vi.fn(),
}));

const { CommissionPage } = await import("./CommissionPage");
const { FinancePage } = await import("./FinancePage");

const norm = (s: string | null) => (s ?? "").replace(/\s/g, " ");

describe("CommissionPage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "e1", isFinance: false, isAdmin: false, hasMfa: true };
  });

  it("shows gross, reserve, after-reserve and subsidy separately (§6.3, §14.2)", () => {
    render(<CommissionPage />);
    expect(norm(screen.getByText("Provision brutto").closest("section")!.textContent)).toContain("840,00 €");
    expect(norm(screen.getByText("Reserve (10 %)").closest("section")!.textContent)).toContain("84,00 €");
    expect(norm(screen.getByText("Nach Reserve", { selector: "h4" }).closest("section")!.textContent)).toContain("756,00 €");
    expect(norm(screen.getByText("Zuschuss (genehmigt)").closest("section")!.textContent)).toContain("400,00 €");
    const personal = screen.getByText(/Eigenproduktion/).closest("tr")!;
    expect(norm(personal.textContent)).toContain("560,00 €");
    expect(norm(personal.textContent)).toContain("504,00 €");
  });

  it("never calls the amount take-home pay", () => {
    render(<CommissionPage />);
    expect(screen.queryByText(/netto|auszahlung/i)).not.toBeInTheDocument();
  });

  it("links the finance workspace only for finance/admin", () => {
    render(<CommissionPage />);
    expect(screen.queryByText("Abrechnung (Finanzen)")).not.toBeInTheDocument();
  });

  it("explains that vault-only users have no statement", () => {
    state.perms = { employeeId: null as unknown as string, isFinance: false, isAdmin: false, hasMfa: false };
    render(<CommissionPage />);
    expect(screen.getByText(/nur für aktive Mitarbeitende/)).toBeInTheDocument();
  });
});

describe("FinancePage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "f1", isFinance: true, isAdmin: false, hasMfa: true };
    state.periodStatus = "reviewed";
  });

  it("offers the next workflow steps for the month", () => {
    render(<FinancePage />);
    expect(screen.getByRole("button", { name: "Freigeben" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Wieder öffnen" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Als ausgezahlt markieren" })).not.toBeInTheDocument();
  });

  it("offers nothing for a paid month", () => {
    state.periodStatus = "paid";
    render(<FinancePage />);
    const toolbar = screen.getByText("Ausgezahlt").closest("div")!;
    expect(within(toolbar).queryAllByRole("button").map((b) => b.textContent)).toEqual(["CSV"]);
  });

  it("disables every write without MFA", () => {
    state.perms.hasMfa = false;
    render(<FinancePage />);
    expect(screen.getByRole("note")).toHaveTextContent("Zwei-Faktor");
    expect(screen.getByRole("button", { name: "Freigeben" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zuschuss speichern" })).toBeDisabled();
  });

  it("is closed to non-finance users", () => {
    state.perms = { employeeId: "e1", isFinance: false, isAdmin: false, hasMfa: true };
    render(<FinancePage />);
    expect(screen.getByText("Nur für Finanzen und Verwaltung.")).toBeInTheDocument();
  });
});
