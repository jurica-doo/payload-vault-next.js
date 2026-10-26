import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";

/**
 * Forecasts (§7.5): estimates, never guarantees. Each result carries the
 * method in German so the UI can show how it was computed, and nothing here
 * feeds official career or commission figures.
 * Dates are calendar dates "YYYY-MM-DD"; period ends are exclusive.
 */

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY);

export type Projection = { value: Decimal; method: string } | null;

/** Month-end value at the current month's pace (as_of counts as elapsed). */
export function projectMonthEnd(actual: NumericInput, monthStart: string, asOf: string): Projection {
  const a = toDecimal(actual);
  if (a === null) return null;
  const [y, m] = [Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7))];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const elapsed = daysBetween(monthStart, asOf) + 1;
  if (elapsed < 1 || elapsed > daysInMonth) return null;
  return {
    value: Decimal.max(a, 0).div(elapsed).times(daysInMonth).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    method: `Hochrechnung: bisheriges Tempo (${elapsed} von ${daysInMonth} Tagen)`,
  };
}

/** Average of the last complete months (excludes the current month). */
export function historicalAverage(trend: NumericInput[], months = 3): Projection {
  const complete = trend.slice(0, -1).slice(-months).map((v) => toDecimal(v)).filter((v): v is Decimal => v !== null);
  if (complete.length === 0) return null;
  const sum = complete.reduce((s, v) => s.plus(Decimal.max(v, 0)), new Decimal(0));
  return {
    value: sum.div(complete.length).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    method: `Durchschnitt der letzten ${complete.length} abgeschlossenen Monate`,
  };
}

export type CareerForecast = {
  projected: Decimal;
  onTrack: boolean;
  /** Points per remaining day needed to reach the requirement (0 if met). */
  neededPerDay: Decimal | null;
  remainingDays: number;
  method: string;
} | null;

/** Linear projection of career points to the (exclusive) period end. */
export function projectCareer(eligible: NumericInput, required: NumericInput, windowStart: string, periodEnd: string, asOf: string): CareerForecast {
  const e = toDecimal(eligible);
  const r = toDecimal(required);
  if (e === null || r === null) return null;
  const total = daysBetween(windowStart, periodEnd);
  const elapsed = daysBetween(windowStart, asOf) + 1;
  if (total <= 0 || elapsed < 1) return null;
  const remainingDays = Math.max(total - elapsed, 0);
  const projected = Decimal.max(e, 0).div(Math.min(elapsed, total)).times(total).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const missing = Decimal.max(r.minus(e), 0);
  return {
    projected,
    onTrack: projected.gte(r),
    neededPerDay: missing.isZero() ? new Decimal(0) : remainingDays === 0 ? null : missing.div(remainingDays).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    remainingDays,
    method: `Lineare Hochrechnung bis Periodenende (${Math.min(elapsed, total)} von ${total} Tagen)`,
  };
}
