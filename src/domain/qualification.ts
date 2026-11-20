import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";

/**
 * TypeScript mirror of app_private.apply_career_rules (migration
 * 20261101170000_profina_final_rules.sql), used by the career simulator.
 * Shared golden cases: GC-CAREER-xxx.
 *
 * Profina's Karriereplan (final answers 2026-11):
 *  - personal production is never capped
 *  - 50 % clause: only the strongest structure counts at most
 *    threshold × cap ratio, and at most kvRequired × cap ratio of its KV;
 *    every other structure counts in full
 *  - minimum own business (FB 30, TL 60 EP) when the level asks for it
 *  - retention rate (Nachhaltigkeitsquote) = net ÷ (net + cancelled) of the
 *    counted business, at least the level's minimum (90 %)
 *  - negative nets (reversals) count as 0
 */

export type StructureInput = { id: string; points: NumericInput; kv: NumericInput };

export type StructureResult = {
  id: string;
  gross: Decimal;
  grossKv: Decimal;
  eligible: Decimal;
  eligibleKv: Decimal;
  strongest: boolean;
  capApplied: boolean;
  kvCapApplied: boolean;
};

export type RetentionResult = {
  settled: Decimal;
  cancelled: Decimal;
  /** null when nothing was settled yet. */
  ratio: Decimal | null;
  required: Decimal | null;
  ok: boolean;
};

export type QualificationResult = {
  required: Decimal;
  kvRequired: Decimal;
  capValue: Decimal | null;
  kvCapValue: Decimal | null;
  personal: { points: Decimal; kv: Decimal };
  structures: StructureResult[];
  eligible: Decimal;
  eligibleKv: Decimal;
  pointsMissing: Decimal;
  kvMissing: Decimal;
  ownRequired: Decimal | null;
  ownMissing: Decimal;
  ownOk: boolean;
  retention: RetentionResult;
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
  ownMin?: NumericInput;
  cancelled?: NumericInput;
  minRetention?: NumericInput;
}): QualificationResult {
  const threshold = toDecimal(input.threshold) ?? new Decimal(0);
  const kvRatio = toDecimal(input.kvRatio) ?? new Decimal(0);
  const capRatio = toDecimal(input.capRatio);
  const kvRequired = round4(threshold.times(kvRatio));
  const capValue = capRatio === null ? null : threshold.times(capRatio);
  const kvCapValue = capRatio === null ? null : round4(kvRequired.times(capRatio));

  const structures: StructureResult[] = input.structures
    .map((s) => ({ id: s.id, gross: zeroFloor(s.points), grossKv: zeroFloor(s.kv) }))
    .sort((a, b) => b.gross.comparedTo(a.gross) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s, index) => {
      const strongestCapped = index === 0 && capValue !== null && s.gross.gt(0);
      const eligible = index === 0 && capValue !== null ? Decimal.min(s.gross, capValue) : s.gross;
      const kvLimit = strongestCapped ? Decimal.min(kvCapValue!, eligible) : null;
      return {
        ...s,
        eligible,
        eligibleKv: kvLimit === null ? s.grossKv : Decimal.min(s.grossKv, kvLimit),
        strongest: index === 0 && s.gross.gt(0),
        capApplied: strongestCapped && s.gross.gt(capValue!),
        kvCapApplied: kvLimit !== null && s.grossKv.gt(kvLimit),
      };
    });

  const personal = { points: zeroFloor(input.personalPoints), kv: zeroFloor(input.personalKv) };
  const eligible = structures.reduce((sum, s) => sum.plus(s.eligible), personal.points);
  const eligibleKv = structures.reduce((sum, s) => sum.plus(s.eligibleKv), personal.kv);

  const ownRequired = toDecimal(input.ownMin ?? null);
  const ownOk = ownRequired === null || personal.points.gte(ownRequired);

  const cancelled = zeroFloor(input.cancelled ?? 0);
  const settled = structures.reduce((sum, s) => sum.plus(s.gross), personal.points).plus(cancelled);
  const ratio = settled.gt(0) ? round4(settled.minus(cancelled).div(settled)) : null;
  const minRetention = toDecimal(input.minRetention ?? null);
  const retentionOk = minRetention === null || ratio === null || ratio.gte(minRetention);

  return {
    required: threshold,
    kvRequired,
    capValue,
    kvCapValue,
    personal,
    structures,
    eligible,
    eligibleKv,
    pointsMissing: Decimal.max(threshold.minus(eligible), 0),
    kvMissing: Decimal.max(kvRequired.minus(eligibleKv), 0),
    ownRequired,
    ownMissing: ownRequired === null ? new Decimal(0) : Decimal.max(ownRequired.minus(personal.points), 0),
    ownOk,
    retention: { settled, cancelled, ratio, required: minRetention, ok: retentionOk },
    isReady: eligible.gte(threshold) && eligibleKv.gte(kvRequired) && ownOk && retentionOk,
  };
}
