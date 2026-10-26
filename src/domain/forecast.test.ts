import { describe, expect, it } from "vitest";
import { daysBetween, historicalAverage, projectCareer, projectMonthEnd } from "./forecast";

describe("projectMonthEnd", () => {
  it("projects at the current pace", () => {
    // 10 points after 10 of 31 October days → 31
    expect(projectMonthEnd(10, "2026-10-01", "2026-10-10")?.value.toString()).toBe("31");
  });

  it("counts the first day as elapsed (no division by zero)", () => {
    expect(projectMonthEnd(2, "2026-10-01", "2026-10-01")?.value.toString()).toBe("62");
  });

  it("handles February in a leap year", () => {
    expect(projectMonthEnd(29, "2028-02-01", "2028-02-29")?.value.toString()).toBe("29");
  });

  it("returns null outside the month or for bad input", () => {
    expect(projectMonthEnd(10, "2026-10-01", "2026-11-01")).toBeNull();
    expect(projectMonthEnd(null, "2026-10-01", "2026-10-05")).toBeNull();
  });

  it("never projects negative values (reversals)", () => {
    expect(projectMonthEnd(-5, "2026-10-01", "2026-10-05")?.value.toString()).toBe("0");
  });

  it("states its method", () => {
    expect(projectMonthEnd(10, "2026-10-01", "2026-10-10")?.method).toMatch(/10 von 31 Tagen/);
  });
});

describe("historicalAverage", () => {
  it("averages the last complete months, ignoring the running one", () => {
    expect(historicalAverage([1, 10, 20, 30, 999])?.value.toString()).toBe("20");
  });

  it("works with fewer months and returns null with none", () => {
    expect(historicalAverage([8, 99])?.method).toMatch(/letzten 1/);
    expect(historicalAverage([99])).toBeNull();
  });
});

describe("projectCareer", () => {
  it("projects linearly to the period end and says if it is enough", () => {
    // 50 points after 73 of 365 days → 250 projected vs 100 required
    const f = projectCareer(50, 100, "2026-01-01", "2027-01-01", "2026-03-14");
    expect(f?.projected.toString()).toBe("250");
    expect(f?.onTrack).toBe(true);
    expect(f?.remainingDays).toBe(292);
  });

  it("computes the daily pace still needed", () => {
    const f = projectCareer(10, 100, "2026-01-01", "2027-01-01", "2026-12-01");
    expect(f?.onTrack).toBe(false);
    expect(f?.neededPerDay?.toString()).toBe("3"); // 90 missing over 30 days
  });

  it("needs nothing once the requirement is met", () => {
    expect(projectCareer(120, 100, "2026-01-01", "2027-01-01", "2026-06-01")?.neededPerDay?.toString()).toBe("0");
  });

  it("returns null pace on the last day if still short", () => {
    expect(projectCareer(10, 100, "2026-01-01", "2027-01-01", "2026-12-31")?.neededPerDay).toBeNull();
  });

  it("handles a short transition period", () => {
    expect(daysBetween("2027-11-01", "2028-01-01")).toBe(61);
    expect(projectCareer(30, 100, "2027-11-01", "2028-01-01", "2027-11-30")?.projected.toString()).toBe("61");
  });
});
