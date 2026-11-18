import Decimal from "decimal.js";
import { toDecimal } from "../utils/format";

/**
 * Typed view of public.rpc_rules_at(date) — the rule set in force on a date.
 * Used by the admin rules page and by the TypeScript preview engine
 * (src/domain/points.ts). Values stay Decimal; nothing here is a float.
 */

export const LEVEL_CODES = ["FA", "FB", "TL", "OL", "DL", "RL", "VD", "VDP", "GM"] as const;
export type LevelCode = (typeof LEVEL_CODES)[number];

/** German level names (Karriereplan, Anlage 2). VD+ and GM are appointed, from 2026-11-01. */
export const LEVEL_NAMES: Record<LevelCode, string> = {
  FA: "Finanzassistent", FB: "Fachberater", TL: "Teamleiter", OL: "Organisationsleiter",
  DL: "Direktionsleiter", RL: "Regionalleiter", VD: "Vertriebsdirektor",
  VDP: "Vertriebsdirektor+", GM: "Generalmanager",
};

/** Name for any stored level code; unknown codes are shown as they are. */
export const levelName = (code: string): string =>
  Object.hasOwn(LEVEL_NAMES, code) ? LEVEL_NAMES[code as LevelCode] : code;

/** Short labels as Profina writes them (the code VDP is shown as "VD+"). */
export const levelShort = (code: string | null | undefined): string =>
  code === "VDP" ? "VD+" : (code ?? "–");

/**
 * How a conversion version reads its divisors: "points" (until 2026-10-31)
 * divides into points, "ae" (Karriereplan Stand 01.11.2026) is the
 * Absatzteiler: AE = basis ÷ divisor (2 dp), points = AE ÷ AE per point.
 */
export type DivisorUnit = "points" | "ae";

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
  /** Reached only by appointment (VD+, GM); never a qualification target. */
  appointedOnly: boolean;
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
  /** false: points/AE for the career, but no commission per point (Kfz, Rechtsschutz from 2026-11). */
  paysCommission: boolean;
};

export type RulesSnapshot = {
  date: string;
  levels: { versionId: string; label: string; effectiveFrom: string; reserveRatio: Decimal; rows: CareerLevel[] } | null;
  conversion: {
    versionId: string;
    label: string;
    effectiveFrom: string;
    aePerPoint: Decimal;
    divisorUnit: DivisorUnit;
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
          reserveRatio: dec(levels.reserve_ratio),
          rows: ((levels.rows as Json[]) ?? []).map((r) => ({
            code: r.code as LevelCode,
            rank: Number(r.rank),
            nameDe: String(r.name_de),
            pointRate: dec(r.point_rate),
            maxSubsidy: decOrNull(r.max_subsidy),
            thresholdPoints: dec(r.threshold_points),
            kvMinRatio: dec(r.kv_min_ratio),
            structureCapRatio: decOrNull(r.structure_cap_ratio),
            appointedOnly: r.appointed_only === true,
          })),
        }
      : null,
    conversion: conversion
      ? {
          versionId: String(conversion.version_id),
          label: String(conversion.label),
          effectiveFrom: String(conversion.effective_from),
          aePerPoint: dec(conversion.ae_per_point),
          divisorUnit: conversion.divisor_unit === "ae" ? "ae" : "points",
          rows: ((conversion.rows as Json[]) ?? []).map((r) => ({
            categoryCode: String(r.category_code),
            nameDe: String(r.name_de),
            isKv: r.is_kv === true,
            formulaKind: r.formula_kind as FormulaKind,
            divisor: decOrNull(r.divisor),
            maxTermYears: r.max_term_years === null || r.max_term_years === undefined ? null : Number(r.max_term_years),
            requiredPremiumPeriod: (r.required_premium_period ?? null) as ConversionRule["requiredPremiumPeriod"],
            requiredNetGross: (r.required_net_gross ?? null) as ConversionRule["requiredNetGross"],
            paysCommission: r.pays_commission !== false,
          })),
        }
      : null,
  };
}

/** Minimum KV points for a target level (§4.4): threshold × KV ratio. */
export const kvRequirement = (level: CareerLevel): Decimal => level.thresholdPoints.times(level.kvMinRatio);

export const levelByCode = (rules: RulesSnapshot, code: LevelCode): CareerLevel | undefined =>
  rules.levels?.rows.find((l) => l.code === code);

/** The qualification target after `code`, or undefined at the top (VD; VD+ and GM are appointed). */
export const nextLevel = (rules: RulesSnapshot, code: LevelCode): CareerLevel | undefined => {
  const current = levelByCode(rules, code);
  return current ? rules.levels?.rows.find((l) => l.rank === current.rank + 1 && !l.appointedOnly) : undefined;
};
