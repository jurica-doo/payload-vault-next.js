import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../hooks/useTasks/useTasks";
import { UserFacingError } from "../../utils/dbErrors";

const t = (id: string, status: string, due: string | null) => ({ id, status, due_at: due } as Task);

const state = vi.hoisted(() => ({
  perms: { employeeId: "me", isLeader: true, isAdmin: false, hasMfa: false },
  tasks: { data: [] as Task[], isLoading: false, error: null as Error | null },
}));

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
vi.mock("../../hooks/useStructure/useStructure", () => ({ useStructure: () => ({ data: undefined }) }));
vi.mock("../../hooks/useTasks/useTasks", () => ({
  CLOSED_TASK_DAYS: 90,
  useTasks: () => ({
    ...state.tasks, refetch: vi.fn(),
    setStatus: { mutate: vi.fn(), mutateAsync: vi.fn() }, create: { mutateAsync: vi.fn() },
    runGenerators: { mutate: vi.fn(), isPending: false },
  }),
}));

const { TasksPage, sortTasks } = await import("./TasksPage");

const task = (id: string, extra: Partial<Task>): Task => ({
  id, owner_id: "me", created_by: null, source: "manual", type: "manual", title: `Aufgabe ${id}`, description: null,
  linked_type: null, linked_id: null, due_at: "2099-01-01T16:00:00Z", priority: "normal", status: "open",
  completed_at: null, completion_note: null, created_at: "", updated_at: "", dismissed: false, ...extra,
} as Task);

describe("sortTasks", () => {
  it("splits overdue, upcoming and closed tasks and sorts by due date", () => {
    const now = "2026-10-27T12:00:00Z";
    const r = sortTasks([
      t("late2", "open", "2026-10-20T10:00:00Z"),
      t("later", "open", "2026-11-05T10:00:00Z"),
      t("nodue", "open", null),
      t("late1", "open", "2026-10-01T10:00:00Z"),
      t("soon", "open", "2026-10-28T10:00:00Z"),
      t("done", "done", "2026-10-01T10:00:00Z"),
      t("gone", "cancelled", null),
    ], now);
    expect(r.overdue.map((x) => x.id)).toEqual(["late1", "late2"]);
    expect(r.upcoming.map((x) => x.id)).toEqual(["soon", "later", "nodue"]);
    expect(r.done.map((x) => x.id)).toEqual(["done", "gone"]);
  });
});

describe("TasksPage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "me", isLeader: true, isAdmin: false, hasMfa: false };
    state.tasks = { data: [], isLoading: false, error: null };
  });

  it("P4-UI-04 shows an error instead of 'no tasks' when loading fails", () => {
    state.tasks = { data: [], isLoading: false, error: new UserFacingError("Keine Verbindung zum Server.") };
    render(<TasksPage />);
    expect(screen.getByText("Keine Verbindung zum Server.")).toBeInTheDocument();
    expect(screen.queryByText("Keine offenen Aufgaben.")).not.toBeInTheDocument();
  });

  it("P4-UX-10 system tasks have no checkbox and say they close themselves", () => {
    state.tasks.data = [task("m", {}), task("s", { source: "system", type: "lead_first_contact", title: "Erstkontakt: Lena" })];
    render(<TasksPage />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByText(/schließt sich automatisch/)).toBeInTheDocument();
  });

  it("P4-UX-10 managers can dismiss a report's system task, owners cannot", () => {
    state.tasks.data = [
      task("own", { source: "system", type: "lead_first_contact", title: "Eigene" }),
      task("rep", { source: "system", type: "lead_first_contact", title: "Bericht", owner_id: "fa" }),
    ];
    render(<TasksPage />);
    expect(screen.queryByRole("button", { name: "Aktionen für Eigene" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Team" }));
    expect(screen.getByRole("button", { name: "Aktionen für Bericht" })).toBeInTheDocument();
  });

  it("P4-UI-01 admins get the generator button, disabled without 2FA", () => {
    state.perms = { employeeId: "me", isLeader: false, isAdmin: true, hasMfa: false };
    render(<TasksPage />);
    expect(screen.getByRole("button", { name: "Generatoren ausführen" })).toBeDisabled();
  });
});
