import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const employees = [
  { id: "e1", first_name: "Tina", last_name: "Leiter", employee_no: "P1", status: "active" },
  { id: "e2", first_name: "Dora", last_name: "Direktor", employee_no: "P2", status: "active" },
  { id: "e3", first_name: "Fritz", last_name: "Berater", employee_no: "P3", status: "active" },
];

vi.mock("../../hooks/useEmployees/useEmployees", () => ({ useEmployees: () => ({ data: employees }) }));
vi.mock("../../hooks/useStructure/useStructure", () => ({
  useAssignments: () => ({
    data: [
      { id: "a1", manager_id: "e1", effective_from: "2026-01-01", effective_to: null, change_reason: "Eintritt", created_at: "" },
    ],
    isLoading: false,
    assign: { mutateAsync: vi.fn(), isPending: false },
    cancelFuture: { mutateAsync: vi.fn(), isPending: false },
  }),
  useCancelledAssignments: () => ({
    data: [
      {
        assignment_id: "a2", manager_id: "e2", effective_from: "2099-01-01", change_reason: "Wechsel ins Team Dora",
        cancelled_at: "2026-10-30T09:15:00Z", cancelled_by: "Ada Admin", cancel_reason: "Wechsel wurde abgesagt",
      },
    ],
  }),
}));
vi.mock("../../hooks/permissions/usePermissions", () => ({
  usePermissions: () => ({ permissions: { isAdmin: true, hasMfa: true } }),
}));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: vi.fn(), closeModal: vi.fn() }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
// The searchable dropdown is tested on its own; a plain select is enough here.
vi.mock("../../components/employeePicker/EmployeePicker", () => ({
  EmployeePicker: ({ label, employees: list, onChange }: { label: string; employees: typeof employees; onChange: (id: string) => void }) => (
    <label>
      {label}
      <select defaultValue="" onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {list.map((e) => (
          <option key={e.id} value={e.id}>{`${e.last_name}, ${e.first_name}`}</option>
        ))}
      </select>
    </label>
  ),
}));

const { HierarchyAdminPage } = await import("./HierarchyAdminPage");

describe("HierarchyAdminPage", () => {
  it("keeps cancelled planned moves in the history, newest first", () => {
    render(<HierarchyAdminPage />);
    fireEvent.change(screen.getByLabelText("Person"), { target: { value: "e3" } });

    const entries = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("Direktor, Dora");
    expect(entries[0]).toHaveTextContent("Abgesagt");
    expect(entries[0]).toHaveTextContent("geplant ab 01.01.2099");
    expect(entries[0]).toHaveTextContent("von Ada Admin – Wechsel wurde abgesagt");
    expect(within(entries[0]).queryByRole("button", { name: "Absagen" })).not.toBeInTheDocument();
    expect(entries[1]).toHaveTextContent("Leiter, Tina");
    expect(entries[1]).toHaveTextContent("Aktuell");
  });
});
