import { describe, expect, it } from "vitest";
import { slaErrors, stageChangeMessage } from "./LeadsAdminPage";
import { parseGermanDecimal } from "../../utils/format";

const ok = { hours: "8", start: "09:00", end: "17:00", region: "DE" };

describe("slaErrors", () => {
  it("accepts a valid working day", () => {
    expect(Object.values(slaErrors(ok, [1, 2, 3, 4, 5])).every((e) => e === undefined)).toBe(true);
  });

  it("P4-UX-14 names each problem instead of only disabling the button", () => {
    const e = slaErrors({ hours: "0", start: "18:00", end: "09:00", region: "XY" }, []);
    expect(e.hours).toMatch(/1 bis 400/);
    expect(e.end).toMatch(/nach dem Arbeitsbeginn/);
    expect(e.region).toMatch(/DE-BY/);
    expect(e.days).toMatch(/Arbeitstag/);
    expect(slaErrors({ ...ok, hours: "401" }, [1]).hours).toBeDefined();
  });
});

describe("stageChangeMessage", () => {
  const base = { required: ["owner"], skip: true, active: true };
  it("P4-UX-16 says when a stage is deactivated", () => {
    expect(stageChangeMessage(base, { ...base, active: false })).toMatch(/deaktiviert/);
  });
  it("mentions required fields only when they change", () => {
    expect(stageChangeMessage(base, { ...base, required: ["owner", "phone_or_email"] })).toMatch(/Pflichtfelder/);
    expect(stageChangeMessage(base, { ...base, skip: false })).not.toMatch(/Pflichtfelder/);
  });
  it("is empty when nothing changed", () => {
    expect(stageChangeMessage(base, { ...base, required: ["owner"] })).toBe("");
  });
});

describe("source cost amount", () => {
  it("P4-BUG-02 German amounts reach the API as plain decimals", () => {
    expect(parseGermanDecimal("100,00")).toBe("100.00");
    expect(parseGermanDecimal("1.234,50")).toBe("1234.50");
    expect(parseGermanDecimal("abc")).toBeNull();
  });
});
