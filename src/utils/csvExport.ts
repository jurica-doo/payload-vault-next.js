import type { StoredProduct } from "../hooks/useExpenses/types";
import type { PdfRecord } from "../hooks/usePdf/types";
import type { SingleExpensePdf } from "../views/allPdfs/types";

export const GERMAN_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export const EXPENSE_KONTO: Record<string, number> = {
  Mobilität: 4530,
  Geschäftsessen: 4650,
  Reisen: 4660,
  "Büro & Arbeitsmittel": 4900,
  Kommunikation: 4920,
  Weiterbildung: 4950,
  Versicherungen: 4360,
  "Bank & Gebühren": 4970,
  Marketing: 4600,
  Sonstiges: 4900,
};

export const INCOME_KONTO: Record<string, number> = {
  "Adcuri Abschlussprovision": 8300,
  "Adcuri Bestandsprovision": 8300,
  "Barmenia Abrechnung": 8300,
  "Strom & Gas": 8400,
  "IKK Abrechnung": 8400,
};

export function formatAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function getGermanMonth(dateStr: string): string {
  const month = new Date(dateStr).getMonth();
  return GERMAN_MONTHS[month];
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Escapes a value for a semicolon-separated CSV cell.
 *
 * Two distinct problems are handled here:
 *
 * 1. **Formula injection (CWE-1236).** Excel, LibreOffice and DATEV import
 *    treat a cell beginning with `=`, `+`, `-`, `@` or a leading tab/CR as a
 *    formula, so a value like `=HYPERLINK("http://evil","click")` — or the
 *    classic `=cmd|'/c calc'!A1` — executes when the accountant opens the
 *    export. These exports carry `vendor_name` and `file_name`, which are not
 *    trustworthy: `vendor_name` is produced by the AI from whatever text is on
 *    an uploaded receipt (a third party can put anything on an invoice they
 *    send us) and `file_name` is the raw name of the uploaded file. We prefix
 *    such values with a single quote, the conventional neutraliser that
 *    spreadsheets strip on display.
 *
 * 2. **Field/record breakout.** A value containing `;`, a quote or a newline
 *    would otherwise shift every following column or forge extra rows. RFC 4180
 *    quoting keeps the document structurally intact.
 */
export function escapeCsvValue(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);

  // Strip control characters that have no business in a CSV cell (NUL and the
  // like); keep the text otherwise intact so the export stays readable.
  const cleaned = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

  const needsFormulaGuard = /^[=+\-@\t\r]/.test(cleaned);
  const guarded = needsFormulaGuard ? `'${cleaned}` : cleaned;

  if (/[";\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  return guarded;
}

export function generateExpenseCsv(
  expenses: SingleExpensePdf[],
  activeCategory?: string,
): string {
  const header = "Datum;Betrag;Kategorie;Konto;Beschreibung";
  const rows: string[] = [header];

  for (const expense of expenses) {
    const products: StoredProduct[] = Array.isArray(expense.products)
      ? expense.products
      : [];

    if (products.length > 0) {
      const relevantProducts = activeCategory
        ? products.filter((p) => p.category === activeCategory)
        : products;

      for (const product of relevantProducts) {
        const konto = EXPENSE_KONTO[product.category] ?? 4900;
        rows.push(
          `${formatDate(expense.expense_date)};${formatAmount(product.amount)};${escapeCsvValue(product.category)};${konto};${escapeCsvValue(expense.vendor_name)}`,
        );
      }
    } else {
      const konto = EXPENSE_KONTO[expense.category] ?? 4900;
      rows.push(
        `${formatDate(expense.expense_date)};${formatAmount(expense.amount)};${escapeCsvValue(expense.category)};${konto};${escapeCsvValue(expense.vendor_name)}`,
      );
    }
  }

  return rows.join("\n");
}

export function generateIncomeCsv(pdfs: PdfRecord[]): string {
  const header =
    "Datum;Betrag;Währung;Konto;Gegenkonto;Belegfeld1;Buchungstext";
  const rows: string[] = [header];

  for (const pdf of pdfs) {
    const monthName = getGermanMonth(pdf.date_created);
    const buchungstext = `${pdf.category} ${monthName}`;
    const datum = formatDate(pdf.date_created);
    const belegfeld1 = pdf.file_name;

    if (pdf.general_grant && pdf.general_grant !== 0) {
      const mainAmount = pdf.profit - pdf.general_grant;
      const mainKonto = INCOME_KONTO[pdf.category] ?? 8300;

      rows.push(
        `${datum};${formatAmount(mainAmount)};EUR;${mainKonto};1200;${escapeCsvValue(belegfeld1)};${escapeCsvValue(buchungstext)}`,
      );

      rows.push(
        `${datum};${formatAmount(pdf.general_grant)};EUR;8400;1200;${escapeCsvValue(belegfeld1)};${escapeCsvValue(buchungstext)}`,
      );
    } else {
      const konto = INCOME_KONTO[pdf.category] ?? 8300;
      rows.push(
        `${datum};${formatAmount(pdf.profit)};EUR;${konto};1200;${escapeCsvValue(belegfeld1)};${escapeCsvValue(buchungstext)}`,
      );
    }
  }

  return rows.join("\n");
}

export function downloadCsv(csvContent: string, fileName: string): void {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function buildCsvFileName(parts: (string | null)[]): string {
  const slugify = (value: string) =>
    value.toLowerCase().trim().replace(/\s+/g, "_");

  return parts
    .filter((v): v is string => Boolean(v))
    .map(slugify)
    .join("_")
    .concat("_export.csv");
}
