import { describe, expect, it } from "vitest";
import { kvRequirement, levelByCode, levelName, levelShort, nextLevel, parseRules } from "./rules";
import { RULES_2026_11_PAYLOAD, SEEDED_RULES_PAYLOAD } from "./__fixtures__/seededRules";

describe("parseRules", () => {
  const rules = parseRules(SEEDED_RULES_PAYLOAD);

  it("parses levels with decimals", () => {
    expect(rules.levels?.rows).toHaveLength(7);
    expect(levelByCode(rules, "FB")?.pointRate.toString()).toBe("56");
    expect(levelByCode(rules, "FA")?.maxSubsidy).toBeNull();
  });

  it("computes KV requirements (§4.4)", () => {
    expect(kvRequirement(levelByCode(rules, "FB")!).toString()).toBe("10");
    expect(kvRequirement(levelByCode(rules, "VD")!).toString()).toBe("900");
  });

  it("finds the next level and stops at VD", () => {
    expect(nextLevel(rules, "TL")?.code).toBe("OL");
    expect(nextLevel(rules, "VD")).toBeUndefined();
  });

  it("parses conversion rules and the AE factor", () => {
    expect(rules.conversion?.aePerPoint.toString()).toBe("28");
    expect(rules.conversion?.rows.find((r) => r.categoryCode === "KV")?.isKv).toBe(true);
    expect(rules.conversion?.rows.find((r) => r.categoryCode === "KFZ")?.divisor).toBeNull();
  });

  it("handles a date without rules", () => {
    expect(parseRules({ date: "2025-01-01", levels: null, conversion: null })).toMatchObject({ levels: null, conversion: null });
  });

  it("refuses malformed numbers instead of guessing", () => {
    const broken = structuredClone(SEEDED_RULES_PAYLOAD);
    (broken.levels.rows[1] as { point_rate: unknown }).point_rate = "abc";
    expect(() => parseRules(broken)).toThrow(/invalid number/);
  });
});

describe("rules — Karriereplan Stand 01.11.2026", () => {
  const rules2026 = parseRules(RULES_2026_11_PAYLOAD);

  it("reads the AE divisor unit, appointed levels and lines without commission", () => {
    expect(rules2026.conversion?.divisorUnit).toBe("ae");
    expect(parseRules(SEEDED_RULES_PAYLOAD).conversion?.divisorUnit).toBe("points");
    expect(rules2026.levels?.rows.filter((l) => l.appointedOnly).map((l) => l.code)).toEqual(["VDP", "GM"]);
    expect(rules2026.conversion?.rows.filter((r) => !r.paysCommission && r.formulaKind !== "none").map((r) => r.categoryCode)).toEqual(["KFZ"]);
    expect(rules2026.conversion?.rows.filter((r) => !r.countsForCareer).map((r) => r.categoryCode)).toEqual(["KFZ"]);
  });

  it("never targets an appointed level", () => {
    expect(nextLevel(rules2026, "RL")?.code).toBe("VD");
    expect(nextLevel(rules2026, "VD")).toBeUndefined();
    expect(nextLevel(rules2026, "VDP")).toBeUndefined();
  });

  it("names and abbreviates VD+ and GM", () => {
    expect(levelName("VDP")).toBe("Vertriebsdirektor+");
    expect(levelName("GM")).toBe("Generalmanager");
    expect(levelName("toString")).toBe("toString");
    expect(levelShort("VDP")).toBe("VD+");
    expect(levelShort("TL")).toBe("TL");
    expect(levelShort(null)).toBe("–");
  });
});
