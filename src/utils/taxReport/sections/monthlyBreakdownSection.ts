import type { jsPDF } from "jspdf";
import type { PdfRecord } from "../../../hooks/usePdf/types";
import type { ExpenseRecord } from "../../../hooks/useExpenses/types";
import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  COLORS,
  TABLE_MARGIN,
  formatCurrency,
  addSectionTitle,
} from "../helpers";
import {
  aggregateEarningsByMonth,
  aggregateExpensesByMonth,
  MONTH_FULL_NAMES,
} from "../../../views/statistics/utils";

export function addMonthlyBreakdownSection(
  doc: jsPDF,
  pdfs: PdfRecord[],
  expenses: ExpenseRecord[],
): number {
  let y = CONTENT_TOP;

  // Monthly income
  y = addSectionTitle(doc, "Monatliche Einnahmen", y);

  const earningsMonthly = aggregateEarningsByMonth(pdfs);
  const earningsRows = earningsMonthly.map((m) => [
    MONTH_FULL_NAMES[m.monthIndex],
    formatCurrency(m.total),
  ]);
  const earningsTotal = earningsMonthly.reduce((s, m) => s + m.total, 0);
  earningsRows.push(["Gesamt", formatCurrency(earningsTotal)]);

  (doc as any).autoTable({
    startY: y,
    head: [["Monat", "Betrag"]],
    body: earningsRows,
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
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data: any) => {
      if (data.row.index === earningsRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Monthly expenses
  y = addSectionTitle(doc, "Monatliche Ausgaben", y);

  const expensesMonthly = aggregateExpensesByMonth(expenses);
  const expenseRows = expensesMonthly.map((m) => [
    MONTH_FULL_NAMES[m.monthIndex],
    formatCurrency(m.total),
  ]);
  const expenseTotal = expensesMonthly.reduce((s, m) => s + m.total, 0);
  expenseRows.push(["Gesamt", formatCurrency(expenseTotal)]);

  (doc as any).autoTable({
    startY: y,
    head: [["Monat", "Betrag"]],
    body: expenseRows,
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
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data: any) => {
      if (data.row.index === expenseRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}
