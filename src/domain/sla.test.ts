import { describe, expect, it } from "vitest";
import { addBusinessHours, type SlaCalendar } from "./sla";
import { berlinLocalToUtcIso } from "../utils/format";

// Same calendar as the seeded app_settings.lead_sla + business_calendar.
const cal: SlaCalendar = {
  workdayStart: "09:00",
  workdayEnd: "17:00",
  workdays: [1, 2, 3, 4, 5],
  holidays: new Set(["2026-10-03", "2026-12-25", "2026-12-26", "2027-01-01"]),
};
const at = (date: string, time: string) => berlinLocalToUtcIso(date, time);

describe("addBusinessHours (golden cases shared with supabase/tests/170_leads.test.sql)", () => {
  it.each([
    ["GC-SLA-001", at("2026-11-02", "10:00"), 8, at("2026-11-03", "10:00")],
    ["GC-SLA-002", at("2026-11-06", "16:00"), 2, at("2026-11-09", "10:00")],
    ["GC-SLA-003", at("2026-11-07", "12:00"), 1, at("2026-11-09", "10:00")],
    ["GC-SLA-004", at("2026-12-24", "16:00"), 4, at("2026-12-28", "12:00")],
    ["GC-SLA-005", at("2026-10-23", "15:00"), 8, at("2026-10-26", "15:00")],
    ["GC-SLA-006", at("2026-11-03", "07:30"), 0.5, at("2026-11-03", "09:30")],
    ["GC-SLA-007", at("2026-11-04", "18:00"), 1, at("2026-11-05", "10:00")],
  ])("%s", (_id, start, hours, expected) => {
    expect(addBusinessHours(start, hours, cal)).toBe(expected);
  });

  it("keeps seconds of the start time", () => {
    expect(addBusinessHours("2026-11-02T09:15:30.000Z", 1, cal)).toBe("2026-11-02T10:15:30.000Z");
  });

  it("DST: 15:00 wall time is 14:00 UTC after the switch", () => {
    expect(addBusinessHours(at("2026-10-23", "15:00"), 8, cal)).toBe("2026-10-26T14:00:00.000Z");
  });

  it("rejects negative hours", () => {
    expect(() => addBusinessHours(at("2026-11-02", "10:00"), -1, cal)).toThrow();
  });
});
