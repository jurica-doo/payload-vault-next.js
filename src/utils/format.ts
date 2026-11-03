import Decimal from "decimal.js";
import { UserFacingError } from "./dbErrors";

/**
 * Display formatting for the sales system (de-DE).
 *
 * Values arrive as Postgres `numeric` strings ("10.5000"), plain numbers or
 * Decimal instances. They are never converted to JS floats on the way to the
 * screen: Decimal → exact string → Intl.NumberFormat, which formats decimal
 * strings without float rounding (ES2023). Rounding for display is half-up
 * ("halfExpand"), matching the ledger rule in IMPLEMENTATION_PLAN.md §1.
 *
 * Missing or invalid values render as an en dash, never "NaN" or "0".
 */

export type NumericInput = Decimal | number | string | null | undefined;

export const EMPTY_VALUE = "–";

const LOCALE = "de-DE";

export function toDecimal(value: NumericInput): Decimal | null {
  if (value === null || value === undefined) return null;
  if (Decimal.isDecimal(value)) return value.isFinite() ? value : null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function formatDecimal(
  value: NumericInput,
  options: Intl.NumberFormatOptions,
): string {
  const d = toDecimal(value);
  if (d === null) return EMPTY_VALUE;
  // `signDisplay: "negative"` hides the sign of values that round to zero
  // (-0.001 → "0,00" instead of "-0,00").
  return new Intl.NumberFormat(LOCALE, { signDisplay: "negative", ...options })
    // Intl accepts exact decimal strings; the cast is for older TS lib types.
    .format(d.toFixed() as unknown as number);
}

/** 1234.5 → "1.234,50 €" */
export function formatMoney(value: NumericInput): string {
  return formatDecimal(value, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Points are stored with 4 dp and shown with 2 by default (OD-07). */
export function formatPoints(value: NumericInput, fractionDigits = 2): string {
  return formatDecimal(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** AE are shown as whole numbers with grouping: 2800 → "2.800". */
export function formatAe(value: NumericInput): string {
  return formatDecimal(value, { maximumFractionDigits: 0 });
}

/** 0.4 → "40 %". Ratio, not percentage, as input. */
/** Whole number with German thousands separator: 1506 → "1.506". */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(ratio: NumericInput, fractionDigits = 0): string {
  return formatDecimal(ratio, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * numerator ÷ denominator, or null when the denominator is missing or zero.
 * Conversion rates must say "–" rather than divide by zero (§8.2).
 */
export function safeRatio(
  numerator: NumericInput,
  denominator: NumericInput,
): Decimal | null {
  const n = toDecimal(numerator);
  const d = toDecimal(denominator);
  if (n === null || d === null || d.isZero()) return null;
  return n.div(d);
}

/**
 * Business dates ("2026-10-26") are calendar dates, not instants: formatting
 * them through `new Date()` would shift them by the viewer's UTC offset.
 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return EMPTY_VALUE;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return EMPTY_VALUE;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/** Timestamps are shown in Europe/Berlin, the business time zone (§1). */
export function formatDateTime(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return EMPTY_VALUE;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Normalises German number input to a plain decimal string for the API:
 * "1.234,56" → "1234.56", "10,5" → "10.5". Returns null when the text is not
 * a number, so forms can show an error instead of silently sending 0.
 */
export function parseGermanDecimal(text: string): string | null {
  const trimmed = text.trim().replace(/\s/g, "");
  if (trimmed === "") return null;
  // Thousands separators are dots, decimal separator is a comma.
  if (trimmed.includes(",")) {
    // Dots may only group thousands before the comma, so an English
    // "1,234.50" is refused rather than read as 1.2345.
    if (!/^-?(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(trimmed)) return null;
    return trimmed.replace(/\./g, "").replace(",", ".");
  }
  // Without a comma, a dot followed by exactly three digits groups thousands.
  const normalized = /^-?\d{1,3}(\.\d{3})+$/.test(trimmed) ? trimmed.replace(/\./g, "") : trimmed;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/** "HH:MM" (or "H:MM") within 00:00–23:59. */
export function isValidTime(time: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  return m !== null && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** "YYYY-MM-DD" that exists in the calendar. */
export function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * E.164 phone for display, grouped like German numbers are written:
 * "+491701234567" → "+49 170 1234567". Other formats are returned unchanged.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "–";
  const de = /^\+49(1\d{2}|[2-9]\d{1,3})(\d+)$/.exec(phone);
  return de ? `+49 ${de[1]} ${de[2]}` : phone;
}

/**
 * A Berlin wall-clock time ("2026-07-01", "17:00") as a UTC ISO timestamp,
 * correct across daylight-saving changes. Used for due dates, which people
 * mean in local time.
 */
export function berlinLocalToUtcIso(date: string, time = "00:00"): string {
  // Strict: "25:99" or "abc" must not roll over into another day (P4-BUG-01, P4-UI-05).
  if (!isValidTime(time)) throw new UserFacingError("Bitte eine gültige Uhrzeit angeben (00:00–23:59).");
  if (!isValidDate(date)) throw new UserFacingError("Bitte ein gültiges Datum angeben.");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ts: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Berlin", hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).formatToParts(new Date(ts)).map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - ts;
  };
  // Two passes handle the hour around a DST switch.
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first)).toISOString();
}

/** Today's business date in Europe/Berlin as "YYYY-MM-DD". */
export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
