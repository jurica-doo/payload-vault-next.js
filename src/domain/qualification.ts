import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";

/**
 * TypeScript mirror of app_private.apply_career_rules (migration
 * 20261026190000_career_engine.sql), used by the career simulator.
 * Shared golden cases: GC-CAREER-xxx.
 *
 *  - personal production is never capped
 *  - with a cap ratio, each structure counts at most threshold × ratio (§4.5)
 *  - a capped structure keeps its KV share proportionally (OD-03)
 *  - negative nets (reversals) count as 0
 *  - ready iff eligible ≥ threshold and eligible KV ≥ threshold × KV ratio (§4.4)
 */

export type StructureInput = { id: string; points: NumericInput; kv: NumericInput };

export type StructureResult = {
  id: string;
  gross: Decimal;
  grossKv: Decimal;
  eligible: Decimal;
  eligibleKv: Decimal;
  capApplied: boolean;
};

export type QualificationResult = {
  required: Decimal;
  kvRequired: Decimal;
  capValue: Decimal | null;
  personal: { points: Decimal; kv: Decimal };
  structures: StructureResult[];
  eligible: Decimal;
  eligibleKv: Decimal;
  pointsMissing: Decimal;
  kvMissing: Decimal;
  isReady: boolean;
};

const zeroFloor = (v: NumericInput) => Decimal.max(toDecimal(v) ?? 0, 0);
const round4 = (d: Decimal) => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export function applyCareerRules(input: {
  threshold: NumericInput;
  kvRatio: NumericInput;
  capRatio: NumericInput;
  personalPoints: NumericInput;
  personalKv: NumericInput;
  structures: StructureInput[];
}): QualificationResult {
  const threshold = toDecimal(input.threshold) ?? new Decimal(0);
  const kvRatio = toDecimal(input.kvRatio) ?? new Decimal(0);
  const capRatio = toDecimal(input.capRatio);
  const capValue = capRatio === null ? null : threshold.times(capRatio);

  const structures = input.structures
    .map((s) => {
      const gross = zeroFloor(s.points);
      const grossKv = zeroFloor(s.kv);
      const eligible = capValue === null ? gross : Decimal.min(gross, capValue);
      return {
        id: s.id,
        gross,
        grossKv,
        eligible,
        eligibleKv: gross.isZero() ? new Decimal(0) : round4(grossKv.times(eligible).div(gross)),
        capApplied: capValue !== null && gross.gt(capValue),
      };
    })
    .sort((a, b) => b.gross.comparedTo(a.gross) || a.id.localeCompare(b.id));

  const personal = { points: zeroFloor(input.personalPoints), kv: zeroFloor(input.personalKv) };
  const eligible = structures.reduce((sum, s) => sum.plus(s.eligible), personal.points);
  const eligibleKv = structures.reduce((sum, s) => sum.plus(s.eligibleKv), personal.kv);
  const kvRequired = round4(threshold.times(kvRatio));

  return {
    required: threshold,
    kvRequired,
    capValue,
    personal,
    structures,
    eligible,
    eligibleKv,
    pointsMissing: Decimal.max(threshold.minus(eligible), 0),
    kvMissing: Decimal.max(kvRequired.minus(eligibleKv), 0),
    isReady: eligible.gte(threshold) && eligibleKv.gte(kvRequired),
  };
}
