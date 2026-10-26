/**
 * TypeScript mirror of app_private.period_plan (migration
 * 20261026190000_career_engine.sql), used by the career simulator. Dates are
 * calendar dates as "YYYY-MM-DD"; ranges are half-open [start, end).
 * Shared golden cases: GC-PERIOD-xxx.
 */

export type CareerPeriodType = "first_personal" | "transition" | "calendar";
export type PlannedPeriod = { type: CareerPeriodType; start: string; end: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];

/** One year after the start; a 29 February start ends on 1 March. */
export function firstYearEnd(start: string): string {
  const [y, m, d] = parts(start);
  if (m === 2 && d === 29) return ymd(y + 1, 3, 1);
  // Same month/day next year is always valid except 29 Feb (handled above).
  return ymd(y + 1, m, d);
}

export function periodPlan(start: string, until: string): PlannedPeriod[] {
  const firstEnd = firstYearEnd(start);
  const plan: PlannedPeriod[] = [{ type: "first_personal", start, end: firstEnd }];
  if (firstEnd > until) return plan;

  const [fy, fm, fd] = parts(firstEnd);
  let year: string;
  if (fm === 1 && fd === 1) {
    year = firstEnd;
  } else {
    const jan = ymd(fy + 1, 1, 1);
    plan.push({ type: "transition", start: firstEnd, end: jan });
    year = jan;
  }
  while (year <= until) {
    const next = ymd(parts(year)[0] + 1, 1, 1);
    plan.push({ type: "calendar", start: year, end: next });
    year = next;
  }
  return plan;
}

export const PERIOD_LABELS: Record<CareerPeriodType, string> = {
  first_personal: "Erstes persönliches Karrierejahr",
  transition: "Übergangszeitraum",
  calendar: "Kalenderjahr",
};
