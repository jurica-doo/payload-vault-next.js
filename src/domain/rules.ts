import Decimal from "decimal.js";
import { toDecimal } from "../utils/format";

/**
 * Typed view of public.rpc_rules_at(date) — the rule set in force on a date.
 * Used by the admin rules page and by the TypeScript preview engine
 * (src/domain/points.ts). Values stay Decimal; nothing here is a float.
 */

export const LEVEL_CODES = ["FA", "FB", "TL", "OL", "DL", "RL", "VD"] as const;
export type LevelCode = (typeof LEVEL_CODES)[number];

export type FormulaKind = "lv_monthly_term" | "kv_monthly" | "sach_annual_net" | "none";

export type CareerLevel = {
  code: LevelCode;
  rank: number;
  nameDe: string;
  pointRate: Decimal;
  maxSubsidy: Decimal | null;
  thresholdPoints: Decimal;
  kvMinRatio: Decimal;
  structureCapRatio: Decimal | null;
};

export type ConversionRule = {
  categoryCode: string;
  nameDe: string;
  isKv: boolean;
  formulaKind: FormulaKind;
  divisor: Decimal | null;
  maxTermYears: number | null;
  requiredPremiumPeriod: "monthly" | "annual" | null;
  requiredNetGross: "net" | "gross" | null;
};

export type RulesSnapshot = {
  date: string;
  levels: { versionId: string; label: string; effectiveFrom: string; rows: CareerLevel[] } | null;
  conversion: {
    versionId: string;
    label: string;
    effectiveFrom: string;
    aePerPoint: Decimal;
    rows: ConversionRule[];
  } | null;
};

type Json = Record<string, unknown>;

const dec = (v: unknown): Decimal => {
  const d = toDecimal(v as string | number | null);
  if (d === null) throw new Error(`invalid number in rules: ${String(v)}`);
  return d;
};
const decOrNull = (v: unknown): Decimal | null => (v === null || v === undefined ? null : dec(v));

/** Throws on malformed input: a broken rule set must never yield a number. */
export function parseRules(payload: unknown): RulesSnapshot {
  const p = (payload ?? {}) as Json;
  const levels = p.levels as Json | null | undefined;
  const conversion = p.conversion as Json | null | undefined;

  return {
    date: String(p.date ?? ""),
    levels: levels
      ? {
          versionId: String(levels.version_id),
          label: String(levels.label),
          effectiveFrom: String(levels.effective_from),
          rows: ((levels.rows as Json[]) ?? []).map((r) => ({
            code: r.code as LevelCode,
            rank: Number(r.rank),
            nameDe: String(r.name_de),
            pointRate: dec(r.point_rate),
            maxSubsidy: decOrNull(r.max_subsidy),
            thresholdPoints: dec(r.threshold_points),
            kvMinRatio: dec(r.kv_min_ratio),
            structureCapRatio: decOrNull(r.structure_cap_ratio),
          })),
        }
      : null,
    conversion: conversion
      ? {
          versionId: String(conversion.version_id),
          label: String(conversion.label),
          effectiveFrom: String(conversion.effective_from),
          aePerPoint: dec(conversion.ae_per_point),
          rows: ((conversion.rows as Json[]) ?? []).map((r) => ({
            categoryCode: String(r.category_code),
            nameDe: String(r.name_de),
            isKv: r.is_kv === true,
            formulaKind: r.formula_kind as FormulaKind,
            divisor: decOrNull(r.divisor),
            maxTermYears: r.max_term_years === null || r.max_term_years === undefined ? null : Number(r.max_term_years),
            requiredPremiumPeriod: (r.required_premium_period ?? null) as ConversionRule["requiredPremiumPeriod"],
            requiredNetGross: (r.required_net_gross ?? null) as ConversionRule["requiredNetGross"],
          })),
        }
      : null,
  };
}

/** Minimum KV points for a target level (§4.4): threshold × KV ratio. */
export const kvRequirement = (level: CareerLevel): Decimal => level.thresholdPoints.times(level.kvMinRatio);

export const levelByCode = (rules: RulesSnapshot, code: LevelCode): CareerLevel | undefined =>
  rules.levels?.rows.find((l) => l.code === code);

/** The level after `code`, or undefined at the top (VD). */
export const nextLevel = (rules: RulesSnapshot, code: LevelCode): CareerLevel | undefined => {
  const current = levelByCode(rules, code);
  return current ? rules.levels?.rows.find((l) => l.rank === current.rank + 1) : undefined;
};
