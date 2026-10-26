import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { promptText } from "./ProfilePage";

const state = vi.hoisted(() => ({ perms: { employeeId: "tl", isLeader: true } }));
const profile = {
  employee: { id: "fa", name: "Anna FA", status: "active", start_date: "2026-01-01", level: "FA" },
  trend: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}-01`, points: i, kv: 0 })),
  product_mix: [{ category: "KV", contracts: 3, points: 30 }],
  goals: [{ month: "2026-10-01", status: "approved", target: 20, actual: 15 }],
  career: { status: "in_progress", target: "FB", points_missing: "0", kv_missing: "3" },
  prompts: [{ code: "kv_gap", value: "3" }],
  next_review_on: "2026-11-01",
};
const coachingData = {
  sessions: [{ id: "s1", held_on: "2026-10-01", summary: "Fokus KV" }],
  actions: [{ id: "a1", title: "KV-Termine", status: "open", owner_id: "fa", due_on: "2026-10-05" }],
  notes: [{ id: "n1", visibility: "private_manager", body: "Unsicher bei Einwänden", created_at: "2026-10-02T10:00:00Z" }],
};
const m = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };

vi.mock("../../hooks/permissions/usePermissions", () => ({ usePermissions: () => ({ permissions: state.perms }) }));
vi.mock("../../hooks/useCoaching/useCoaching", () => ({
  useProfile: () => ({ data: profile, isLoading: false, error: null }),
  useCoaching: () => ({ data: coachingData, addSession: m, setActionStatus: m, addNote: m }),
}));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
vi.mock("../../components/charts/TrendChart", () => ({ TrendChart: () => null }));

const { ProfilePage } = await import("./ProfilePage");
const ID = "00000000-0000-0000-0000-0000000000fa";

describe("ProfilePage", () => {
  beforeEach(() => {
    state.perms = { employeeId: "tl", isLeader: true };
  });

  it("rejects malformed ids without calling the API", () => {
    render(<ProfilePage employeeId="../../etc" />);
    expect(screen.getByText("Unbekannte Person.")).toBeInTheDocument();
  });

  it("shows prompts as conversation starters, not verdicts", () => {
    render(<ProfilePage employeeId={ID} />);
    expect(screen.getByText(/es fehlen noch 3,00 KV-Punkte/)).toBeInTheDocument();
    expect(screen.getByText(/keine Bewertung/)).toBeInTheDocument();
  });

  it("marks private notes and offers the coaching forms to managers", () => {
    render(<ProfilePage employeeId={ID} />);
    expect(screen.getByText("privat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gespräch speichern" })).toBeInTheDocument();
  });

  it("hides the coaching forms from non-managers", () => {
    state.perms = { employeeId: "fa", isLeader: false };
    render(<ProfilePage employeeId={ID} />);
    expect(screen.queryByRole("button", { name: "Gespräch speichern" })).not.toBeInTheDocument();
  });
});

describe("promptText", () => {
  it("words every prompt as a question or neutral observation", () => {
    expect(promptText({ code: "behind_goal", actual: 5, target: 20 })).toMatch(/\?$/);
    expect(promptText({ code: "declining_trend", recent: 5, before: 10 })).toMatch(/Gespräch/);
    expect(promptText({ code: "overdue_actions", count: 2 })).toBe("2 vereinbarte Maßnahme(n) sind überfällig.");
  });
});
