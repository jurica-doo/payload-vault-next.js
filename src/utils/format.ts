import Decimal from "decimal.js";

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
  // Thousands separators are dots, decimal separator is a comma. A dot with
  // exactly three digits after it and no comma is treated as grouping.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}
