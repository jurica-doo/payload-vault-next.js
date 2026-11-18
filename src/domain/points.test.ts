import { describe, expect, it } from "vitest";
import { calculatePoints, type PointsInput } from "./points";
import { parseRules } from "./rules";
import { RULES_2026_11_PAYLOAD, SEEDED_RULES_PAYLOAD } from "./__fixtures__/seededRules";

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

// Same cases and IDs as supabase/tests/300_rules_profina_2026_11.test.sql.
// AE are rounded to 2 dp in this version, so they are compared with 2 dp.
const rules2026 = parseRules(RULES_2026_11_PAYLOAD);
const golden2026 = (
  category: string,
  premium: string | number,
  period: PointsInput["period"],
  netOrGross: PointsInput["netOrGross"],
  termYears: string | number | null,
  productionDate = "2026-11-15",
) => {
  const r = calculatePoints(rules2026, { category, premium, period, netOrGross, termYears, productionDate });
  return r.ok ? [r.points.toFixed(4), r.ae.toFixed(2), r.kvPoints.toFixed(4)].join("|") : `error:${r.error}`;
};

describe("points engine — Karriereplan Stand 01.11.2026 (AE first)", () => {
  it.each([
    ["GC-POINTS-101", golden2026("LV", 100, "monthly", null, 35), "10.4996|293.99|0.0000"],
    ["GC-POINTS-102", golden2026("LV", 100, "monthly", null, 40), "11.9996|335.99|0.0000"],
    ["GC-POINTS-103", golden2026("KV", 700, "monthly", null, null), "25.0000|700.00|25.0000"],
    ["GC-POINTS-104", golden2026("SACH", 1000, "annual", "net", null), "4.9950|139.86|0.0000"],
    ["GC-POINTS-105", golden2026("KFZ", 1000, "annual", "net", null), "1.0000|28.00|0.0000"],
    ["GC-POINTS-106", golden2026("RS", 500, "annual", "net", null), "2.4975|69.93|0.0000"],
    ["GC-POINTS-107", golden2026("STROM", 80, "monthly", null, null), "0.0000|0.00|0.0000"],
    ["GC-POINTS-108", golden2026("KFZ", 1000, "annual", "gross", null), "error:net_premium_required"],
    ["GC-POINTS-109", golden("RS", 500, "annual", "net", null, "2026-10-31"), "error:unknown_category"],
    ["GC-POINTS-110", golden2026("KV", "333.33", "monthly", null, null), "11.9046|333.33|11.9046"],
  ])("%s", (_id, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("never caps the LV term and shows the AE step in the formula", () => {
    const r = calculatePoints(rules2026, {
      category: "LV", premium: 100, period: "monthly", netOrGross: null, termYears: 40, productionDate: "2026-11-15",
    });
    expect(r.ok && r.termCapped).toBe(false);
    expect(r.ok && r.formula).toBe("100 × 12 × 40 ÷ 142.86 = 335.99 AE; 335.99 AE ÷ 28");
  });

  it("marks Kfz and Rechtsschutz as lines without commission per point", () => {
    const input = { premium: 1000, period: "annual", netOrGross: "net", termYears: null, productionDate: "2026-11-15" } as const;
    for (const category of ["KFZ", "RS"]) {
      const r = calculatePoints(rules2026, { ...input, category });
      expect(r.ok && r.paysCommission).toBe(false);
    }
    const sach = calculatePoints(rules2026, { ...input, category: "SACH" });
    expect(sach.ok && sach.paysCommission).toBe(true);
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
