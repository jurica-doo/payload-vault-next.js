import { describe, expect, it } from "vitest";
import { periodPlan } from "./careerPeriods";
import { applyCareerRules, type StructureInput } from "./qualification";

// Same cases and IDs as supabase/tests/070_career_engine.test.sql.

const planStr = (start: string, until: string) =>
  periodPlan(start, until).map((p) => `${p.type}:${p.start}..${p.end}`).join(" ");

describe("career periods — golden cases", () => {
  it.each([
    ["GC-PERIOD-001", planStr("2026-11-01", "2028-06-01"),
      "first_personal:2026-11-01..2027-11-01 transition:2027-11-01..2028-01-01 calendar:2028-01-01..2029-01-01"],
    ["GC-PERIOD-002", planStr("2026-01-01", "2027-03-01"),
      "first_personal:2026-01-01..2027-01-01 calendar:2027-01-01..2028-01-01"],
    ["GC-PERIOD-003", planStr("2028-02-29", "2030-06-01"),
      "first_personal:2028-02-29..2029-03-01 transition:2029-03-01..2030-01-01 calendar:2030-01-01..2031-01-01"],
    ["GC-PERIOD-004", planStr("2026-12-31", "2027-12-31"),
      "first_personal:2026-12-31..2027-12-31 transition:2027-12-31..2028-01-01"],
    ["GC-PERIOD-005", planStr("2027-03-01", "2026-10-26"), "first_personal:2027-03-01..2028-03-01"],
  ])("%s", (_id, actual, expected) => {
    expect(actual).toBe(expected);
  });
});

const rulesStr = (
  threshold: number, kvRatio: number, capRatio: number | null,
  personalPoints: number, personalKv: number, structures: StructureInput[],
) => {
  const r = applyCareerRules({ threshold, kvRatio, capRatio, personalPoints, personalKv, structures });
  return [r.eligible.toString(), r.eligibleKv.toString(), String(r.isReady), r.kvMissing.toString()].join("|");
};

describe("qualification rules — golden cases", () => {
  it.each([
    ["GC-CAREER-001", rulesStr(100, 0.1, null, 100, 7, []), "100|7|false|3"],
    ["GC-CAREER-002", rulesStr(100, 0.1, null, 100, 10, []), "100|10|true|0"],
    ["GC-CAREER-003", rulesStr(750, 0.1, 0.5, 0, 0, [{ id: "A", points: "800", kv: "0" }]), "375|0|false|75"],
    ["GC-CAREER-004", rulesStr(750, 0.1, 0.5, 100, 0, [{ id: "A", points: "800", kv: "80" }, { id: "B", points: "300", kv: "40" }]), "775|77.5|true|0"],
    ["GC-CAREER-005", rulesStr(300, 0.1, null, 0, 0, [{ id: "A", points: "800", kv: "30" }]), "800|30|true|0"],
    ["GC-CAREER-006", rulesStr(100, 0.1, null, -10, -1, [{ id: "A", points: "-5", kv: "0" }]), "0|0|false|10"],
    ["GC-CAREER-007", rulesStr(750, 0.1, 0.5, 0, 0, [{ id: "A", points: "375", kv: "50" }]), "375|50|false|25"],
  ])("%s", (_id, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("does not flag a structure exactly at the cap", () => {
    const r = applyCareerRules({ threshold: 750, kvRatio: 0.1, capRatio: 0.5, personalPoints: 0, personalKv: 0, structures: [{ id: "A", points: 375, kv: 0 }] });
    expect(r.structures[0].capApplied).toBe(false);
  });

  it("orders structures by size and reports the cap value", () => {
    const r = applyCareerRules({
      threshold: 750, kvRatio: 0.1, capRatio: 0.5, personalPoints: 0, personalKv: 0,
      structures: [{ id: "small", points: 10, kv: 0 }, { id: "big", points: 900, kv: 0 }],
    });
    expect(r.structures.map((s) => s.id)).toEqual(["big", "small"]);
    expect(r.capValue?.toString()).toBe("375");
    expect(r.pointsMissing.toString()).toBe("365");
  });
});
