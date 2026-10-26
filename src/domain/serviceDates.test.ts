import { describe, expect, it } from "vitest";
import { addYears, nextAnniversary } from "./serviceDates";

describe("nextAnniversary (golden cases shared with supabase/tests/220_service_reminders.test.sql)", () => {
  it.each([
    ["GC-SERVICE-001", "2020-03-15", "2026-10-28", "2027-03-15"],
    ["GC-SERVICE-002", "2024-02-29", "2026-10-28", "2027-02-28"],
    ["GC-SERVICE-003", "2026-11-05", "2026-10-28", "2026-11-05"],
    ["GC-SERVICE-004", "2025-10-28", "2026-10-28", "2026-10-28"],
  ])("%s", (_id, date, from, expected) => {
    expect(nextAnniversary(date, from)).toBe(expected);
  });

  it("29 Feb comes back in leap years", () => {
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });
});
