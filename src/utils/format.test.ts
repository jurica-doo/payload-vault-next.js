import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  berlinLocalToUtcIso,
  EMPTY_VALUE,
  formatAe,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatPhone,
  formatPoints,
  isValidDate,
  isValidTime,
  safeRatio,
  toDecimal,
} from "./format";

// Intl inserts a narrow no-break space before "€" and "%".
const norm = (s: string) => s.replace(/ | /g, " ");

describe("toDecimal", () => {
  it.each([null, undefined, "", "  ", "abc", NaN, Infinity])("returns null for %j", (v) => {
    expect(toDecimal(v as never)).toBeNull();
  });

  it("parses numeric strings exactly", () => {
    expect(toDecimal("10.5000")?.toString()).toBe("10.5");
    expect(toDecimal(new Decimal("0.1").plus("0.2"))?.toString()).toBe("0.3");
  });
});

describe("formatMoney", () => {
  it("formats euros with grouping and two decimals", () => {
    expect(norm(formatMoney("1234.5"))).toBe("1.234,50 €");
    expect(norm(formatMoney(560))).toBe("560,00 €");
  });

  it("rounds half up", () => {
    expect(norm(formatMoney("0.125"))).toBe("0,13 €");
    expect(norm(formatMoney("-0.125"))).toBe("-0,13 €");
  });

  it("never shows negative zero", () => {
    expect(norm(formatMoney("-0.001"))).toBe("0,00 €");
  });

  it("keeps precision beyond float range", () => {
    expect(norm(formatMoney("12345678901234567.89"))).toBe("12.345.678.901.234.567,89 €");
  });

  it("shows an en dash for missing values", () => {
    expect(formatMoney(null)).toBe(EMPTY_VALUE);
  });
});

describe("formatPoints / formatAe", () => {
  it("shows points with two decimals by default", () => {
    expect(formatPoints("10.5000")).toBe("10,50");
    expect(formatPoints("10.5", 4)).toBe("10,5000");
  });

  it("shows AE as grouped integers", () => {
    expect(formatAe("2800.0000")).toBe("2.800");
    expect(formatAe("252000")).toBe("252.000");
  });
});

describe("formatPercent / safeRatio", () => {
  it("formats ratios", () => {
    expect(norm(formatPercent(0.4))).toBe("40 %");
    expect(norm(formatPercent("0.125", 1))).toBe("12,5 %");
  });

  it("returns null for a zero or missing denominator", () => {
    expect(safeRatio(8, 0)).toBeNull();
    expect(safeRatio(8, null)).toBeNull();
    expect(formatPercent(safeRatio(8, 0))).toBe(EMPTY_VALUE);
  });

  it("divides exactly", () => {
    expect(safeRatio(8, 20)?.toString()).toBe("0.4");
  });
});

describe("formatDate / formatDateTime", () => {
  it("formats calendar dates without time-zone shifts", () => {
    expect(formatDate("2026-11-01")).toBe("01.11.2026");
    expect(formatDate("2026-01-01T00:00:00Z")).toBe("01.01.2026");
    expect(formatDate("garbage")).toBe(EMPTY_VALUE);
    expect(formatDate(null)).toBe(EMPTY_VALUE);
  });

  it("shows timestamps in Europe/Berlin, including DST", () => {
    expect(formatDateTime("2026-07-01T10:00:00Z")).toBe("01.07.2026, 12:00");
    expect(formatDateTime("2026-12-01T10:00:00Z")).toBe("01.12.2026, 11:00");
    expect(formatDateTime("nope")).toBe(EMPTY_VALUE);
  });
});

describe("berlinLocalToUtcIso", () => {
  it("handles winter (CET) and summer (CEST)", () => {
    expect(berlinLocalToUtcIso("2026-12-01", "17:00")).toBe("2026-12-01T16:00:00.000Z");
    expect(berlinLocalToUtcIso("2026-07-01", "17:00")).toBe("2026-07-01T15:00:00.000Z");
  });

  it("is correct on the switch days", () => {
    expect(berlinLocalToUtcIso("2026-03-29", "12:00")).toBe("2026-03-29T10:00:00.000Z");
    expect(berlinLocalToUtcIso("2026-10-25", "12:00")).toBe("2026-10-25T11:00:00.000Z");
  });

  it.each(["25:99", "24:00", "12:60", "abc", "", "1230"])("P4-BUG-01 refuses the time %j instead of rolling over", (time) => {
    expect(() => berlinLocalToUtcIso("2026-11-03", time)).toThrow("gültige Uhrzeit");
  });

  it.each(["2026-02-30", "2026-13-01", "03.11.2026", ""])("refuses the date %j", (date) => {
    expect(() => berlinLocalToUtcIso(date, "10:00")).toThrow("gültiges Datum");
  });

  it("accepts a one-digit hour", () => {
    expect(berlinLocalToUtcIso("2026-12-01", "9:05")).toBe("2026-12-01T08:05:00.000Z");
  });
});

describe("isValidTime / isValidDate", () => {
  it("knows the edges", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("P4-UI-03 groups German numbers for display", () => {
    expect(formatPhone("+491701234567")).toBe("+49 170 1234567");
    expect(formatPhone("+436641234567")).toBe("+436641234567");
    expect(formatPhone(null)).toBe("–");
  });
});
