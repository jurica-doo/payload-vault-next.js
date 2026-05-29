import type { jsPDF } from "jspdf";
import type { PdfRecord } from "../../../hooks/usePdf/types";
import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  COLORS,
  TABLE_MARGIN,
  formatCurrency,
  addSectionTitle,
} from "../helpers";
import { INCOME_KONTO, formatDate } from "../../csvExport";

export function addIncomeDetailSection(
  doc: jsPDF,
  pdfs: PdfRecord[],
): number {
  let y = CONTENT_TOP;

  y = addSectionTitle(doc, "Einzelaufstellung Einnahmen", y);

  const sorted = [...pdfs].sort(
    (a, b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime(),
  );

  const rows: string[][] = [];

  for (const pdf of sorted) {
    const konto = INCOME_KONTO[pdf.category] ?? 8300;
    const date = formatDate(pdf.date_created);

    if (pdf.general_grant && pdf.general_grant !== 0) {
      const mainAmount = pdf.profit - pdf.general_grant;
      rows.push([date, pdf.file_name, pdf.category, String(konto), formatCurrency(mainAmount)]);
      rows.push([date, pdf.file_name, "Allgemeiner Zuschuss", "8400", formatCurrency(pdf.general_grant)]);
    } else {
      rows.push([date, pdf.file_name, pdf.category, String(konto), formatCurrency(pdf.profit)]);
    }
  }

  const total = pdfs.reduce((s, p) => s + p.profit, 0);
  rows.push(["", "", "", "Gesamt", formatCurrency(total)]);

  (doc as any).autoTable({
    startY: y,
    head: [["Datum", "Dateiname", "Kategorie", "Konto", "Betrag"]],
    body: rows,
    theme: "grid",
    margin: TABLE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    headStyles: {
      fillColor: COLORS.tableHeader,
      textColor: COLORS.tableHeaderText,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.altRow },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 55 },
      3: { halign: "center", cellWidth: 18 },
      4: { halign: "right", cellWidth: 28 },
    },
    didParseCell: (data: any) => {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}
