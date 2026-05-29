import type { jsPDF } from "jspdf";
import type { PdfRecord } from "../../../hooks/usePdf/types";
import type { ExpenseRecord, StoredProduct } from "../../../hooks/useExpenses/types";
import {
  CONTENT_WIDTH,
  COLORS,
  TABLE_MARGIN,
  formatCurrency,
  addSectionTitle,
} from "../helpers";
import { INCOME_KONTO, EXPENSE_KONTO } from "../../csvExport";

export function addCategorySummarySection(
  doc: jsPDF,
  pdfs: PdfRecord[],
  expenses: ExpenseRecord[],
  startY: number,
): number {
  let y = startY;

  // Income by category
  y = addSectionTitle(doc, "Einnahmen nach Kategorie", y);

  const incomeByCat = new Map<string, number>();
  for (const pdf of pdfs) {
    incomeByCat.set(pdf.category, (incomeByCat.get(pdf.category) ?? 0) + pdf.profit);
  }

  const incomeRows = Array.from(incomeByCat.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => [cat, String(INCOME_KONTO[cat] ?? "–"), formatCurrency(total)]);

  const incomeTotal = pdfs.reduce((s, p) => s + p.profit, 0);
  incomeRows.push(["Gesamt", "", formatCurrency(incomeTotal)]);

  (doc as any).autoTable({
    startY: y,
    head: [["Kategorie", "Konto", "Betrag"]],
    body: incomeRows,
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
      2: { halign: "right" },
    },
    didParseCell: (data: any) => {
      if (data.row.index === incomeRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Expenses by category
  y = addSectionTitle(doc, "Ausgaben nach Kategorie", y);

  const expenseByCat = new Map<string, number>();
  for (const expense of expenses) {
    const products = Array.isArray(expense.products)
      ? (expense.products as StoredProduct[])
      : [];
    if (products.length > 0) {
      for (const product of products) {
        expenseByCat.set(product.category, (expenseByCat.get(product.category) ?? 0) + product.amount);
      }
    } else {
      expenseByCat.set(expense.category, (expenseByCat.get(expense.category) ?? 0) + expense.amount);
    }
  }

  const expenseRows = Array.from(expenseByCat.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => [cat, String(EXPENSE_KONTO[cat] ?? "–"), formatCurrency(total)]);

  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  expenseRows.push(["Gesamt", "", formatCurrency(expenseTotal)]);

  (doc as any).autoTable({
    startY: y,
    head: [["Kategorie", "Konto", "Betrag"]],
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
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "right" },
    },
    didParseCell: (data: any) => {
      if (data.row.index === expenseRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}
