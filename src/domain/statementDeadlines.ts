/**
 * Deadlines of a commission statement (Tippgeber-/Handelsvertretervertrag,
 * Ziff. 9 and 10; confirmed by Profina for both contract types, 2026-11):
 *  - objections within 8 weeks of the statement being made available,
 *    afterwards it counts as accepted
 *  - a debit balance must be paid within 10 days
 * The statement is "made available" when finance approves the month
 * (statement_periods.approved_at). Dates are Berlin calendar days.
 */
export const OBJECTION_DAYS = 56;
export const DEBIT_DUE_DAYS = 10;

const berlinDay = (instant: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(instant));

const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function statementDeadlines(approvedAt: string): { availableOn: string; objectionUntil: string; debitDue: string } {
  const availableOn = berlinDay(approvedAt);
  return {
    availableOn,
    objectionUntil: addDays(availableOn, OBJECTION_DAYS),
    debitDue: addDays(availableOn, DEBIT_DUE_DAYS),
  };
}
