import { escapeCsvValue } from "../../utils/csvExport";
import type { LedgerEntry, OverviewRow } from "../../hooks/useCommission/useCommission";

/**
 * CSV builders for statements. Semicolon-separated with German decimal
 * commas (opens directly in German Excel). Text cells go through
 * escapeCsvValue (formula-injection guard); see `line` for numbers.
 */
const num = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : String(v).replace(".", ",");
// Our own formatted numbers (incl. negative reversals) are written raw;
// escapeCsvValue would prefix "-280,00" with an apostrophe and turn it into
// text. Everything else gets the formula-injection guard.
const NUMBER = /^-?\d+(,\d+)?$/;
const line = (cells: unknown[]) =>
  cells.map((c) => (typeof c === "string" && NUMBER.test(c) ? c : escapeCsvValue(c))).join(";");

const TYPE_LABEL: Record<string, string> = { personal: "Eigenproduktion", differential: "Differenz" };

export function ledgerCsv(entries: LedgerEntry[]): string {
  return [
    line(["Produktionsdatum", "Produzent", "Sparte", "Art", "Beziehung", "Buchung", "Punkte", "Satz/P", "Brutto", "Reserve", "Nach Reserve"]),
    ...entries.map((e) =>
      line([
        e.production_date, e.producer_name, e.category_code, TYPE_LABEL[e.commission_type ?? ""] ?? e.commission_type,
        e.relationship, e.entry_kind === "reversal" ? "Rückbuchung" : "Buchung",
        num(e.points), num(e.rate_per_point), num(e.gross_amount), num(e.reserve_amount), num(e.net_after_reserve),
      ]),
    ),
  ].join("\r\n");
}

export function overviewCsv(rows: OverviewRow[]): string {
  return [
    line(["Pers.-Nr.", "Name", "Buchungen", "Brutto", "Reserve", "Nach Reserve", "Zuschuss"]),
    ...rows.map((r) => line([r.employee_no, r.recipient_name, r.entries, num(r.gross), num(r.reserve), num(r.net), num(r.subsidy)])),
  ].join("\r\n");
}
