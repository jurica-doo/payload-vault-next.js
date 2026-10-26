import { describe, expect, it } from "vitest";
import { appointmentState } from "./ActivityPanel";
import { monthWindow } from "./ActivitiesPage";
import { berlinToday } from "../../utils/format";

describe("appointmentState", () => {
  const now = "2026-10-26T12:00:00.000Z";
  it("is booked before the slot and awaits an outcome after it", () => {
    expect(appointmentState({ type: "appointment", outcome: null, scheduled_at: "2026-10-27T09:00:00Z" }, now)).toBe("booked");
    expect(appointmentState({ type: "appointment", outcome: null, scheduled_at: "2026-10-25T09:00:00Z" }, now)).toBe("awaiting_outcome");
  });
  it("shows the recorded outcome", () => {
    expect(appointmentState({ type: "appointment", outcome: "no_show", scheduled_at: "2026-10-25T09:00:00Z" }, now)).toBe("no_show");
  });
  it("is null for other activity types", () => {
    expect(appointmentState({ type: "call", outcome: "reached", scheduled_at: null }, now)).toBeNull();
  });
});

describe("monthWindow", () => {
  it("is the half-open calendar month", () => {
    expect(monthWindow("2026-10-26")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(monthWindow("2026-12-31")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
});

describe("berlinToday", () => {
  it("uses the Berlin date, not UTC", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Berlin (UTC+1).
    expect(berlinToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // 22:30 UTC in summer is 00:30 next day in Berlin (UTC+2).
    expect(berlinToday(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });
});
