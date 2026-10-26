import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";
import { applyCareerRules, type QualificationResult } from "./qualification";

/**
 * Career simulator (§7.4 "whether the current pace is sufficient", §15
 * Phase 3 "career simulator"). Works on the server's current progress and
 * applies the same rule function as the database (qualification.ts mirrors
 * app_private.apply_career_rules), so a simulation can never disagree with
 * the real calculation about how caps and KV shares work.
 * Results are estimates and must be labelled as such in the UI.
 */

export type ProgressBase = {
  required: NumericInput;
  kv_required: NumericInput;
  cap_value: NumericInput | null;
  personal: { points: NumericInput; kv: NumericInput };
  structures: { id: string; name?: string; gross: NumericInput; gross_kv: NumericInput }[];
};

export type Additions = {
  personalPoints?: NumericInput;
  personalKv?: NumericInput;
  /** Extra points/KV per existing structure id. */
  structures?: Record<string, { points?: NumericInput; kv?: NumericInput }>;
};

const d = (v: NumericInput | undefined | null) => toDecimal(v ?? null) ?? new Decimal(0);

function ratios(base: ProgressBase) {
  const required = d(base.required);
  const kvRatio = required.isZero() ? new Decimal(0) : d(base.kv_required).div(required);
  const cap = toDecimal(base.cap_value ?? null);
  const capRatio = cap === null || required.isZero() ? null : cap.div(required);
  return { required, kvRatio, capRatio };
}

export function simulateCareer(base: ProgressBase, add: Additions = {}): QualificationResult {
  const { required, kvRatio, capRatio } = ratios(base);
  const addPoints = d(add.personalPoints);
  const addKv = d(add.personalKv);
  return applyCareerRules({
    threshold: required,
    kvRatio,
    capRatio,
    // KV points are points too: adding KV adds to both totals.
    personalPoints: d(base.personal.points).plus(addPoints).plus(addKv),
    personalKv: d(base.personal.kv).plus(addKv),
    structures: base.structures.map((s) => ({
      id: s.id,
      points: d(s.gross).plus(d(add.structures?.[s.id]?.points)).plus(d(add.structures?.[s.id]?.kv)),
      kv: d(s.gross_kv).plus(d(add.structures?.[s.id]?.kv)),
    })),
  });
}

export type Gap = {
  pointsMissing: Decimal;
  kvMissing: Decimal;
  /** Points a structure can still contribute before hitting the cap (null = no cap). */
  headroom: { id: string; name?: string; remaining: Decimal | null }[];
  /** Personal production is never capped (§4.5). */
  personalUnlimited: true;
};

/** What is still missing, and where additional production would count. */
export function careerGap(base: ProgressBase): Gap {
  const now = simulateCareer(base);
  const cap = toDecimal(base.cap_value ?? null);
  return {
    pointsMissing: now.pointsMissing,
    kvMissing: now.kvMissing,
    headroom: base.structures.map((s) => ({
      id: s.id,
      name: s.name,
      remaining: cap === null ? null : Decimal.max(cap.minus(d(s.gross)), 0),
    })),
    personalUnlimited: true,
  };
}
