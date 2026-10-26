import { describe, expect, it } from "vitest";
import { mapProductionCsv, normalizeDate, parseCsv } from "./csvImport";

describe("parseCsv", () => {
  it("parses semicolon CSV with BOM, CRLF, quotes and escaped quotes", () => {
    const text = '﻿a;b;c\r\n1;"x;y";"say ""hi"""\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1", "x;y", 'say "hi"'],
    ]);
  });

  it("detects comma CSV", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps newlines inside quotes and drops blank lines", () => {
    expect(parseCsv('a;b\n"line1\nline2";2\n\n;\n')).toEqual([["a", "b"], ["line1\nline2", "2"]]);
  });

  it("handles a last line without newline and empty fields", () => {
    expect(parseCsv("a;b;c\n1;;3")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });
});

describe("normalizeDate", () => {
  it.each([
    ["10.05.2026", "2026-05-10"],
    ["1.6.2026", "2026-06-01"],
    ["2026-06-01", "2026-06-01"],
    ["31/12/2026", "31/12/2026"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });
});

describe("mapProductionCsv", () => {
  const csv = parseCsv(
    [
      "Quelle-ID;Pers.-Nr.;Sparte;Beitrag;Rhythmus;Netto/Brutto;Laufzeit;Datum;Referenz;Bemerkung",
      "A-1;p00007;kv;700;monatlich;;;01.06.2026;=HYPERLINK(1);x",
      "A-2;P00007;LV;1.234,56;monatlich;;35;02.06.2026;LV-1;",
      "A-3;P00007;SACH;abc;jährlich;netto;;2026-06-03;;",
    ].join("\n"),
  );
  const mapped = mapProductionCsv(csv);

  it("maps German headers and reports unknown columns", () => {
    expect(mapped.missingColumns).toEqual([]);
    expect(mapped.unknownColumns).toEqual(["Bemerkung"]);
  });

  it("normalises codes, numbers, periods and dates", () => {
    expect(mapped.rows[0]).toMatchObject({ employee_no: "P00007", category: "KV", premium: "700", period: "monthly", production_date: "2026-06-01" });
    expect(mapped.rows[1]).toMatchObject({ premium: "1234.56", term_years: "35" });
    expect(mapped.rows[2]).toMatchObject({ period: "annual", net_or_gross: "net", production_date: "2026-06-03" });
  });

  it("leaves invalid numbers raw so the database reports them per row", () => {
    expect(mapped.rows[2].premium).toBe("abc");
  });

  it("strips formula prefixes from text cells", () => {
    expect(mapped.rows[0].reference).toBe("HYPERLINK(1)");
  });

  it("reports missing required columns", () => {
    expect(mapProductionCsv(parseCsv("Sparte;Beitrag\nKV;700")).missingColumns).toEqual([
      "source_id", "employee_no", "period", "production_date",
    ]);
  });
});
