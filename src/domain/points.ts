import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";
import type { RulesSnapshot } from "./rules";

/**
 * TypeScript mirror of app_private.calculate_points (migration
 * 20261026180000_production.sql), for live previews in forms only.
 * Stored points always come from the database. Both implementations are
 * tested against the same golden cases (GC-POINTS-xxx); keep the validation
 * order and error keys identical.
 *
 * Rounding depends on the conversion version's divisor unit:
 *  - "points" (until 2026-10-31): points = basis ÷ divisor, half-up to 4
 *    decimals; AE = rounded points × AE factor, half-up to 4 decimals.
 *  - "ae" (Karriereplan Stand 01.11.2026, OD-07): AE = basis ÷ Absatzteiler,
 *    half-up to 2 decimals; points = AE ÷ AE factor, half-up to 4 decimals.
 */

export type PointsError =
  | "no_rules_for_date"
  | "premium_must_be_positive"
  | "currency_not_supported"
  | "unknown_category"
  | "premium_period_mismatch"
  | "net_premium_required"
  | "term_required";

export type PointsInput = {
  category: string;
  premium: NumericInput;
  period: "monthly" | "annual" | "one_off";
  netOrGross: "net" | "gross" | null;
  currency?: string;
  termYears: NumericInput;
  /** YYYY-MM-DD; `rules` must be the snapshot for this date. */
  productionDate: string;
};

export type PointsResult =
  | {
      ok: true;
      points: Decimal;
      ae: Decimal;
      kvPoints: Decimal;
      exactPoints: Decimal;
      termUsed: Decimal | null;
      termCapped: boolean;
      formula: string;
      ruleVersionId: string;
      /** false: the line counts for the career but books no commission per point. */
      paysCommission: boolean;
      /** false: the line creates no points (switched off in the rules version). */
      countsForCareer: boolean;
    }
  | { ok: false; error: PointsError };

const fail = (error: PointsError): PointsResult => ({ ok: false, error });
const round4 = (d: Decimal) => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function calculatePoints(rules: RulesSnapshot, input: PointsInput): PointsResult {
  const conversion = rules.conversion;
  if (!conversion || input.productionDate < conversion.effectiveFrom) return fail("no_rules_for_date");

  const premium = toDecimal(input.premium);
  if (premium === null || premium.lte(0)) return fail("premium_must_be_positive");
  if ((input.currency ?? "EUR") !== "EUR") return fail("currency_not_supported");

  const rule = conversion.rows.find((r) => r.categoryCode === input.category);
  if (!rule) return fail("unknown_category");

  if (rule.requiredPremiumPeriod && input.period !== rule.requiredPremiumPeriod) return fail("premium_period_mismatch");
  if (rule.requiredNetGross && input.netOrGross !== rule.requiredNetGross) return fail("net_premium_required");

  let basis: Decimal | null;
  let termUsed: Decimal | null = null;
  let termCapped = false;
  let formula: string;

  switch (rule.countsForCareer ? rule.formulaKind : "off") {
    case "off":
      basis = null;
      formula = "derzeit keine Punkte für diese Sparte";
      break;
    case "lv_monthly_term": {
      const term = toDecimal(input.termYears);
      if (term === null || term.lte(0)) return fail("term_required");
      termUsed = term;
      if (rule.maxTermYears !== null && term.gt(rule.maxTermYears)) {
        termUsed = new Decimal(rule.maxTermYears);
        termCapped = true;
      }
      basis = premium.times(12).times(termUsed);
      formula = `${premium} × 12 × ${termUsed} ÷ ${rule.divisor}`;
      break;
    }
    case "kv_monthly":
    case "sach_annual_net":
      basis = premium;
      formula = `${premium} ÷ ${rule.divisor}`;
      break;
    case "none":
      basis = null;
      formula = "keine Punkte für diese Sparte";
      break;
  }

  const aeFirst = conversion.divisorUnit === "ae";
  let exact: Decimal;
  let points: Decimal;
  let ae: Decimal;
  if (basis === null) {
    exact = points = ae = new Decimal(0);
  } else if (aeFirst) {
    ae = round2(basis.div(rule.divisor!));
    exact = ae.div(conversion.aePerPoint);
    points = round4(exact);
    formula = `${formula} = ${ae} AE; ${ae} AE ÷ ${conversion.aePerPoint}`;
  } else {
    exact = basis.div(rule.divisor!);
    points = round4(exact);
    ae = round4(points.times(conversion.aePerPoint));
  }

  return {
    ok: true,
    points,
    ae,
    kvPoints: rule.isKv ? points : new Decimal(0),
    exactPoints: exact,
    termUsed,
    termCapped,
    formula,
    ruleVersionId: conversion.versionId,
    paysCommission: rule.paysCommission,
    countsForCareer: rule.countsForCareer,
  };
}
