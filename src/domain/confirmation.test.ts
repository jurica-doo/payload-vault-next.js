import { describe, expect, it } from "vitest";
import { confirmationRequired, confirmationState, confirmationWindow } from "./confirmation";

// Golden cases shared with supabase/tests/370_last_decisions.test.sql.
describe("confirmation year (Anlage 2)", () => {
  it.each([
    ["GC-CONFIRM-001", "2026-11-15", "2026-12-01", "2027-12-01"],
    ["GC-CONFIRM-002", "2026-12-31", "2027-01-01", "2028-01-01"],
    ["GC-CONFIRM-003", "2026-12-01", "2027-01-01", "2028-01-01"],
  ])("%s window after a promotion on %s", (_id, promoted, start, end) => {
    expect(confirmationWindow(promoted)).toEqual({ start, end });
  });

  it("GC-CONFIRM-004 needs 80 % of the threshold", () => {
    expect(confirmationRequired(300).toFixed(4)).toBe("240.0000");
    expect(confirmationRequired(100).toFixed(4)).toBe("80.0000");
  });

  const window = { start: "2026-12-01", end: "2027-12-01" };
  it.each([
    ["GC-CONFIRM-005", "239.99", "2027-11-30", null, "running"],
    ["GC-CONFIRM-006", "239.99", "2027-12-01", null, "missed"],
    ["GC-CONFIRM-007", "240", "2027-03-01", null, "met"],
    ["GC-CONFIRM-008", "0", "2026-11-20", null, "pending"],
    ["GC-CONFIRM-009", "100", "2027-12-05", "kept", "kept"],
  ] as const)("%s achieved %s on %s", (_id, achieved, asOf, decision, expected) => {
    expect(confirmationState({ required: "240", achieved, asOf, window, decision })).toBe(expected);
  });
});
