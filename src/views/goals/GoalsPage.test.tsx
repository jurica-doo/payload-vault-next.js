import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const thisMonth = `${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7)}-01`;
const state = vi.hoisted(() => ({ goals: [] as unknown[] }));
const m = { mutateAsync: vi.fn().mockResolvedValue("g1"), isPending: false };

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: { employeeId: "me" } }) }));
vi.mock("../../hooks/useGoals/useGoals", () => ({
  useGoals: () => ({ data: state.goals, isLoading: false, saveDraft: m, submit: m, review: m }),
}));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));

const { GoalsPage } = await import("./GoalsPage");

const goal = (over: Record<string, unknown>) => ({
  id: "g1", employee_id: "me", month: thisMonth, status: "draft", draft: { points: 20 }, submitted_targets: null,
  late: false, last_review_comment: null, employee_name: "Ich", updated_at: "x", ...over,
});

describe("GoalsPage", () => {
  beforeEach(() => {
    state.goals = [];
    m.mutateAsync.mockClear();
  });

  it("locks the form while a goal waits for review", () => {
    state.goals = [goal({ status: "submitted", submitted_targets: { points: 20 } })];
    render(<GoalsPage />);
    expect(screen.getByLabelText("Punkte")).toHaveAttribute("readonly");
    expect(screen.getByText(/Wartet auf Freigabe/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Einreichen" })).not.toBeInTheDocument();
  });

  it("shows the manager's feedback on a returned goal and prefills the submitted values", () => {
    state.goals = [goal({ status: "returned", submitted_targets: { points: 20, kv_points: 2 }, last_review_comment: "KV bitte erhöhen" })];
    render(<GoalsPage />);
    expect(screen.getByRole("note")).toHaveTextContent("KV bitte erhöhen");
    expect(screen.getByLabelText("davon KV-Punkte")).toHaveValue("2");
  });

  it("refuses non-numbers before saving", async () => {
    render(<GoalsPage />);
    fireEvent.change(screen.getByLabelText("Punkte"), { target: { value: "zwanzig" } });
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("„Punkte“ ist keine Zahl.");
    expect(m.mutateAsync).not.toHaveBeenCalled();
  });

  it("sends German decimals normalised", async () => {
    render(<GoalsPage />);
    fireEvent.change(screen.getByLabelText("Punkte"), { target: { value: "12,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    await vi.waitFor(() => expect(m.mutateAsync).toHaveBeenCalledWith({ month: thisMonth, targets: { points: "12.5" } }));
  });

  it("lists team goals awaiting review, not own ones", () => {
    state.goals = [
      goal({ status: "submitted" }),
      goal({ id: "g2", employee_id: "fa", employee_name: "Anna FA", status: "submitted", submitted_targets: { points: 15 } }),
    ];
    render(<GoalsPage />);
    expect(screen.getByText("Zur Freigabe (1)")).toBeInTheDocument();
    expect(screen.getByText(/Anna FA/)).toBeInTheDocument();
  });
});
