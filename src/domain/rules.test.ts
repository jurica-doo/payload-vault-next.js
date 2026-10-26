import { describe, expect, it } from "vitest";
import { kvRequirement, levelByCode, nextLevel, parseRules } from "./rules";
import { SEEDED_RULES_PAYLOAD } from "./__fixtures__/seededRules";

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
