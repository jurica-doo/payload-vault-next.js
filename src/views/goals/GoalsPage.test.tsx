import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../../utils/dbErrors";

const thisMonth = `${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7)}-01`;
const state = vi.hoisted(() => ({ goals: [] as unknown[] }));
const banner = vi.hoisted(() => ({ show: vi.fn() }));
const m = { mutateAsync: vi.fn().mockResolvedValue("g1"), isPending: false };

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: { employeeId: "me" } }) }));
vi.mock("../../hooks/useGoals/useGoals", () => ({
  useGoals: () => ({ data: state.goals, isLoading: false, saveDraft: m, submit: m, review: m }),
}));
const modal = vi.hoisted(() => ({ last: null as null | { children: unknown } }));
vi.mock("../../context/modal/ModalContext", () => ({
  useModal: () => ({ openModal: (o: { children: unknown }) => { modal.last = o; }, closeModal: vi.fn() }),
}));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: banner.show }) }));

const { GoalsPage } = await import("./GoalsPage");

const goal = (over: Record<string, unknown>) => ({
  id: "g1", employee_id: "me", month: thisMonth, status: "draft", draft: { points: 20 }, submitted_targets: null,
  late: false, last_review_comment: null, employee_name: "Ich", updated_at: "x", can_review: false, ...over,
});

describe("GoalsPage", () => {
  beforeEach(() => {
    state.goals = [];
    m.mutateAsync.mockReset().mockResolvedValue("g1");
    banner.show.mockClear();
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
    fireEvent.change(screen.getByLabelText("Punkte"), { target: { value: "1,2,3" } });
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
      goal({ id: "g2", employee_id: "fa", employee_name: "Anna FA", status: "submitted", submitted_targets: { points: 15 }, can_review: true }),
    ];
    render(<GoalsPage />);
    expect(screen.getByText("Zur Freigabe (1)")).toBeInTheDocument();
    expect(screen.getByText(/Anna FA/)).toBeInTheDocument();
  });

  it("P3-GOAL-01: offers no decision on goals the caller may only see (finance, compliance)", () => {
    state.goals = [
      goal({ id: "g2", employee_id: "fa", employee_name: "Anna FA", status: "submitted", submitted_targets: { points: 15 }, can_review: false }),
    ];
    render(<GoalsPage />);
    expect(screen.queryByText(/Zur Freigabe/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Freigeben" })).not.toBeInTheDocument();
  });

  it("P3-GOAL-01: a refused decision becomes a toast, not a silent failure", async () => {
    state.goals = [goal({ id: "g2", employee_id: "fa", employee_name: "Anna FA", status: "submitted", submitted_targets: { points: 15 }, can_review: true })];
    m.mutateAsync.mockRejectedValueOnce(new UserFacingError("Dafür fehlt Ihnen die Berechtigung."));
    render(<GoalsPage />);
    // "Freigeben" opens a dialog with an optional comment; confirm it there.
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    const { container } = render(<>{modal.last!.children as ReactNode}</>);
    fireEvent.click(within(container).getByRole("button", { name: "Freigeben" }));
    await vi.waitFor(() => expect(banner.show).toHaveBeenCalledWith("Entscheidung nicht gespeichert", "Dafür fehlt Ihnen die Berechtigung.", "error"));
  });

  it("explains that editing an approved goal needs a new submission", () => {
    state.goals = [goal({ status: "approved", submitted_targets: { points: 20 } })];
    render(<GoalsPage />);
    expect(screen.getByRole("note")).toHaveTextContent("erneut eingereicht");
    expect(screen.getByRole("button", { name: "Einreichen" })).toBeEnabled();
  });
});
