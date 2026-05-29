import type { jsPDF } from "jspdf";
import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  COLORS,
  TABLE_MARGIN,
  addSectionTitle,
} from "../helpers";
import { INCOME_KONTO, EXPENSE_KONTO } from "../../csvExport";

export function addKontoReferenceSection(doc: jsPDF): number {
  let y = CONTENT_TOP;

  y = addSectionTitle(doc, "Kontenplan-Referenz", y);

  // Income KONTO
  const incomeRows = Object.entries(INCOME_KONTO).map(([cat, konto]) => [
    cat,
    String(konto),
    "Einnahmen",
  ]);

  // Expense KONTO
  const expenseRows = Object.entries(EXPENSE_KONTO).map(([cat, konto]) => [
    cat,
    String(konto),
    "Ausgaben",
  ]);

  const allRows = [...incomeRows, ...expenseRows];

  (doc as any).autoTable({
    startY: y,
    head: [["Kategorie", "Konto", "Typ"]],
    body: allRows,
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
      1: { halign: "center" },
      2: { halign: "center" },
    },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}
