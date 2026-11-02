import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectOption } from "../../components/select/selectOption.testutil";

const useProduction = vi.fn();
const mutation = { mutateAsync: vi.fn(), isPending: false };
const perms = { isLeader: true, isAdmin: false, isFinance: false, hasMfa: false, employeeId: "e1" };

vi.mock("../../hooks/useProduction/useProduction", () => ({ useProduction: (...args: unknown[]) => useProduction(...args) }));
vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: perms }) }));
vi.mock("../../hooks/useStructure/useStructure", () => ({
  useStructure: () => ({
    data: {
      byId: new Map([
        ["e1", { employee_id: "e1", first_name: "Dominko", last_name: "Milic", employee_no: "P00001", status: "active" }],
        ["e2", { employee_id: "e2", first_name: "Laura", last_name: "Becker", employee_no: "P00159", status: "active" }],
      ]),
    },
  }),
}));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));

const { ProductionPage } = await import("./ProductionPage");

describe("ProductionPage", () => {
  beforeEach(() => {
    useProduction.mockReset();
    useProduction.mockReturnValue({
      data: { rows: [], total: 0 },
      isLoading: false,
      error: null,
      save: mutation, submit: mutation, removeDraft: mutation, markEligible: mutation, cancel: mutation,
    });
  });

  it("filters by person on the server and starts again at page 1", () => {
    render(<ProductionPage />);
    expect(useProduction).toHaveBeenLastCalledWith(1, 25, null);
    expect(screen.getByRole("combobox", { name: "Nach Person filtern" })).toHaveTextContent("Alle Personen");

    selectOption("Nach Person filtern", /Becker, Laura/);
    expect(useProduction).toHaveBeenLastCalledWith(1, 25, "e2");
    expect(screen.getByText("Keine Produktion für diese Person")).toBeInTheDocument();

    selectOption("Nach Person filtern", "Alle Personen");
    expect(useProduction).toHaveBeenLastCalledWith(1, 25, null);
  });

  it("offers no person filter to someone who only sees their own production", () => {
    perms.isLeader = false;
    render(<ProductionPage />);
    expect(screen.queryByRole("combobox", { name: "Nach Person filtern" })).not.toBeInTheDocument();
    perms.isLeader = true;
  });
});
