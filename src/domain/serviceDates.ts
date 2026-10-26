/**
 * Service dates (§10.3). Mirrors app_private.next_anniversary: the first
 * anniversary of a date on or after `from`; 29 Feb falls on 28 Feb in common
 * years (Postgres interval arithmetic).
 */
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(n).padStart(2, "0");

export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const year = y + years;
  const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
  return `${year}-${pad(m)}-${pad(day)}`;
}

export function nextAnniversary(date: string, from: string): string {
  if (date >= from) return date;
  for (let n = 1; n <= 200; n++) {
    const candidate = addYears(date, n);
    if (candidate >= from) return candidate;
  }
  throw new Error("date too far in the past");
}
