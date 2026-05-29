import type { jsPDF } from "jspdf";
import type { PdfRecord } from "../../../hooks/usePdf/types";
import type { ExpenseRecord } from "../../../hooks/useExpenses/types";
import {
  PAGE_MARGIN,
  CONTENT_WIDTH,
  COLORS,
  TABLE_MARGIN,
  formatCurrency,
  addSectionTitle,
} from "../helpers";
import { formatDate } from "../../csvExport";

export function addHeaderSection(
  doc: jsPDF,
  year: number,
  pdfs: PdfRecord[],
  expenses: ExpenseRecord[],
  userEmail: string,
): number {
  let y = PAGE_MARGIN + 10;

  // Title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.title);
  doc.text(`STEUERBERICHT ${year}`, PAGE_MARGIN, y + 10);

  // Primary accent bar under title
  doc.setDrawColor(COLORS.primary);
  doc.setLineWidth(1.2);
  doc.line(PAGE_MARGIN, y + 13, PAGE_MARGIN + 55, y + 13);
  y += 20;

  // Meta info block (email + generation date)
  const today = formatDate(new Date().toISOString().slice(0, 10));

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.sectionHeader);
  doc.text("Benutzer:", PAGE_MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.text);
  doc.text(userEmail, PAGE_MARGIN + 22, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.sectionHeader);
  doc.text("Erstellt am:", PAGE_MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.text);
  doc.text(today, PAGE_MARGIN + 22, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.sectionHeader);
  doc.text("Berichtsjahr:", PAGE_MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLORS.text);
  doc.text(String(year), PAGE_MARGIN + 22, y);
  y += 8;

  // Horizontal line
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);
  y += 10;

  // Summary section
  y = addSectionTitle(doc, "Zusammenfassung", y);

  const totalEarnings = pdfs.reduce((sum, p) => sum + p.profit, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const summaryData = [
    ["Gesamteinnahmen", formatCurrency(totalEarnings)],
    ["Gesamtausgaben", formatCurrency(totalExpenses)],
    ["Anzahl Einnahmen", String(pdfs.length)],
    ["Anzahl Ausgaben", String(expenses.length)],
  ];

  (doc as any).autoTable({
    startY: y,
    head: [["Position", "Wert"]],
    body: summaryData,
    theme: "grid",
    margin: TABLE_MARGIN,
    tableWidth: CONTENT_WIDTH,
    headStyles: {
      fillColor: COLORS.tableHeader,
      textColor: COLORS.tableHeaderText,
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.altRow },
    columnStyles: {
      1: { halign: "right" },
    },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}
