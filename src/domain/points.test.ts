import { describe, expect, it } from "vitest";
import { calculatePoints, type PointsInput } from "./points";
import { parseRules } from "./rules";
import { SEEDED_RULES_PAYLOAD } from "./__fixtures__/seededRules";

// Same cases and IDs as supabase/tests/060_production.test.sql.
// Format: "points|ae|kv_points" or "error:<key>", exactly like the SQL helper.
const rules = parseRules(SEEDED_RULES_PAYLOAD);

const golden = (
  category: string,
  premium: string | number,
  period: PointsInput["period"],
  netOrGross: PointsInput["netOrGross"],
  termYears: string | number | null,
  productionDate = "2026-06-01",
  currency = "EUR",
) => {
  const r = calculatePoints(rules, { category, premium, period, netOrGross, termYears, productionDate, currency });
  return r.ok ? [r.points.toFixed(4), r.ae.toFixed(4), r.kvPoints.toFixed(4)].join("|") : `error:${r.error}`;
};

describe("points engine — golden cases", () => {
  it.each([
    ["GC-POINTS-001", golden("LV", 100, "monthly", null, 35), "10.5000|294.0000|0.0000"],
    ["GC-POINTS-002", golden("KV", 700, "monthly", null, null), "25.0000|700.0000|25.0000"],
    ["GC-POINTS-003", golden("SACH", 1000, "annual", "net", null), "5.0000|140.0000|0.0000"],
    ["GC-POINTS-004", golden("KFZ", 500, "annual", null, null), "0.0000|0.0000|0.0000"],
    ["GC-POINTS-005", golden("STROM", 80, "monthly", null, null), "0.0000|0.0000|0.0000"],
    ["GC-POINTS-006", golden("GAS", 80, "monthly", null, null), "0.0000|0.0000|0.0000"],
    ["GC-POINTS-007", golden("LV", 100, "monthly", null, 40), "10.5000|294.0000|0.0000"],
    ["GC-POINTS-008", golden("LV", "85.37", "monthly", null, 23), "5.8905|164.9340|0.0000"],
    ["GC-POINTS-009", golden("KV", "333.33", "monthly", null, null), "11.9046|333.3288|11.9046"],
    ["GC-POINTS-010", golden("SACH", 1000, "annual", "gross", null), "error:net_premium_required"],
    ["GC-POINTS-011", golden("KV", 8400, "annual", null, null), "error:premium_period_mismatch"],
    ["GC-POINTS-012", golden("LV", 100, "monthly", null, null), "error:term_required"],
    ["GC-POINTS-013", golden("KV", 700, "monthly", null, null, "2026-06-01", "USD"), "error:currency_not_supported"],
    ["GC-POINTS-014", golden("KV", 700, "monthly", null, null, "2025-12-31"), "error:no_rules_for_date"],
    ["GC-POINTS-015", golden("SACH", "0.01", "annual", "net", null), "0.0001|0.0028|0.0000"],
    ["GC-POINTS-016", golden("LV", 100, "monthly", null, "10.5"), "3.1500|88.2000|0.0000"],
    ["GC-POINTS-017", golden("KV", 0, "monthly", null, null), "error:premium_must_be_positive"],
  ])("%s", (_id, actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe("points engine — details", () => {
  it("flags a capped LV term and shows the formula with the capped term", () => {
    const r = calculatePoints(rules, {
      category: "LV", premium: 100, period: "monthly", netOrGross: null, termYears: 40, productionDate: "2026-06-01",
    });
    expect(r.ok && r.termCapped).toBe(true);
    expect(r.ok && r.formula).toBe("100 × 12 × 35 ÷ 4000");
  });

  it("reports the unknown category key", () => {
    const r = calculatePoints(rules, {
      category: "XYZ", premium: 1, period: "monthly", netOrGross: null, termYears: null, productionDate: "2026-06-01",
    });
    expect(r).toEqual({ ok: false, error: "unknown_category" });
  });

  it("treats non-numeric premium like a non-positive one", () => {
    const r = calculatePoints(rules, {
      category: "KV", premium: "abc", period: "monthly", netOrGross: null, termYears: null, productionDate: "2026-06-01",
    });
    expect(r).toEqual({ ok: false, error: "premium_must_be_positive" });
  });
});
