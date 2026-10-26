import { describe, expect, it } from "vitest";
import { sortTasks } from "./TasksPage";
import type { Task } from "../../hooks/useTasks/useTasks";

const t = (id: string, status: string, due: string | null) => ({ id, status, due_at: due } as Task);

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
