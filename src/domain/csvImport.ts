import { parseGermanDecimal } from "../utils/format";

/**
 * CSV → rows for rpc_stage_production_import. Parsing happens in the
 * browser; validation is the database's job (every row comes back with its
 * own error list). This module only normalises formats so a German Excel
 * export works as is.
 */

/** RFC 4180-ish parser: quotes, escaped quotes, CRLF, BOM, ; or , delimiter. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

type Field =
  | "source_id"
  | "employee_no"
  | "category"
  | "premium"
  | "period"
  | "net_or_gross"
  | "term_years"
  | "production_date"
  | "reference";

const HEADER_ALIASES: Record<string, Field> = {
  "source_id": "source_id", "quelle-id": "source_id", "quellid": "source_id", "vertragsnummer": "source_id", "id": "source_id",
  "employee_no": "employee_no", "pers.-nr.": "employee_no", "personalnummer": "employee_no", "pers-nr": "employee_no",
  "category": "category", "sparte": "category",
  "premium": "premium", "beitrag": "premium",
  "period": "period", "rhythmus": "period", "zahlweise": "period",
  "net_or_gross": "net_or_gross", "netto/brutto": "net_or_gross",
  "term_years": "term_years", "laufzeit": "term_years",
  "production_date": "production_date", "datum": "production_date", "produktionsdatum": "production_date",
  "reference": "reference", "referenz": "reference",
};

export const REQUIRED_FIELDS: Field[] = ["source_id", "employee_no", "category", "premium", "period", "production_date"];

const PERIODS: Record<string, string> = {
  monatlich: "monthly", monthly: "monthly",
  "jährlich": "annual", jaehrlich: "annual", annual: "annual",
  einmalig: "one_off", one_off: "one_off",
};
const NET_GROSS: Record<string, string> = { netto: "net", net: "net", brutto: "gross", gross: "gross" };

/** Text cells must not start a spreadsheet formula if they're exported later. */
const stripFormula = (s: string) => s.replace(/^[=+\-@\t\r]+/, "");

/** DD.MM.YYYY → YYYY-MM-DD; ISO dates pass through; anything else stays raw. */
export function normalizeDate(s: string): string {
  const t = s.trim();
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  return t;
}

const normalizeNumber = (s: string) => parseGermanDecimal(s) ?? s.trim();

export type MappedImport = {
  rows: Record<Field, string>[];
  missingColumns: Field[];
  unknownColumns: string[];
};

export function mapProductionCsv(table: string[][]): MappedImport {
  const [header = [], ...body] = table;
  const columns = header.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  const missingColumns = REQUIRED_FIELDS.filter((f) => !columns.includes(f));
  const unknownColumns = header.filter((_, i) => columns[i] === null).map((h) => h.trim());

  const rows = body.map((cells) => {
    const get = (f: Field) => {
      const i = columns.indexOf(f);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };
    return {
      source_id: stripFormula(get("source_id")),
      employee_no: get("employee_no").toUpperCase(),
      category: get("category").toUpperCase(),
      premium: normalizeNumber(get("premium")),
      period: PERIODS[get("period").toLowerCase()] ?? get("period"),
      net_or_gross: NET_GROSS[get("net_or_gross").toLowerCase()] ?? get("net_or_gross"),
      term_years: get("term_years") === "" ? "" : normalizeNumber(get("term_years")),
      production_date: normalizeDate(get("production_date")),
      reference: stripFormula(get("reference")),
    };
  });
  return { rows, missingColumns, unknownColumns };
}
