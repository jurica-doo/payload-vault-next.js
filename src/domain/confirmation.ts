import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";

/**
 * Confirmation year after a promotion (Anlage 2, Profina 2026-11-21).
 * Mirrors app_private.confirmation_window / confirmation_state (migration
 * 20261101220000); both sides share the golden cases GC-CONFIRM-xxx.
 *
 * The person must reach at least 80 % of the new level's points threshold in
 * the 12 full calendar months after the promotion month (own production and
 * the whole structure, without the 50 % clause). If not, the management
 * decides whether the person keeps the level or goes back one step.
 * Not for appointed levels (VD+, GM).
 */
export const CONFIRMATION_RATIO = new Decimal("0.8");

export type ConfirmationState = "pending" | "running" | "met" | "missed" | "kept" | "demoted";

const iso = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;

/** [start, end): first day of the month after the promotion month, 12 months long. */
export function confirmationWindow(promotedOn: string): { start: string; end: string } {
  const [y, m] = promotedOn.split("-").map(Number) as [number, number];
  const startIndex = y * 12 + (m - 1) + 1;
  const endIndex = startIndex + 12;
  return {
    start: iso(Math.floor(startIndex / 12), (startIndex % 12) + 1),
    end: iso(Math.floor(endIndex / 12), (endIndex % 12) + 1),
  };
}

/** Points needed: threshold × 80 %, half-up to 4 decimals. */
export const confirmationRequired = (threshold: NumericInput): Decimal =>
  (toDecimal(threshold) ?? new Decimal(0)).times(CONFIRMATION_RATIO).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export function confirmationState(a: {
  required: NumericInput;
  achieved: NumericInput;
  asOf: string;
  window: { start: string; end: string };
  decision?: "kept" | "demoted" | null;
}): ConfirmationState {
  if (a.decision) return a.decision;
  const achieved = toDecimal(a.achieved) ?? new Decimal(0);
  if (achieved.gte(toDecimal(a.required) ?? 0)) return "met";
  if (a.asOf >= a.window.end) return "missed";
  if (a.asOf < a.window.start) return "pending";
  return "running";
}
