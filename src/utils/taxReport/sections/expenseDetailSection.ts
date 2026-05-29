import type { jsPDF } from "jspdf";
import type { ExpenseRecord, StoredProduct } from "../../../hooks/useExpenses/types";
import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  COLORS,
  TABLE_MARGIN,
  formatCurrency,
  addSectionTitle,
} from "../helpers";
import { EXPENSE_KONTO, formatDate } from "../../csvExport";

export function addExpenseDetailSection(
  doc: jsPDF,
  expenses: ExpenseRecord[],
): number {
  let y = CONTENT_TOP;

  y = addSectionTitle(doc, "Einzelaufstellung Ausgaben", y);

  const sorted = [...expenses].sort(
    (a, b) => new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime(),
  );

  const rows: string[][] = [];
  let runningTotal = 0;

  for (const expense of sorted) {
    const date = formatDate(expense.expense_date);
    const vendor = expense.vendor_name ?? "–";
    const products = Array.isArray(expense.products)
      ? (expense.products as StoredProduct[])
      : [];

    if (products.length > 0) {
      for (const product of products) {
        const konto = EXPENSE_KONTO[product.category] ?? 4900;
        rows.push([date, vendor, product.product_name, product.category, String(konto), formatCurrency(product.amount)]);
        runningTotal += product.amount;
      }
    } else {
      const konto = EXPENSE_KONTO[expense.category] ?? 4900;
      rows.push([date, vendor, "–", expense.category, String(konto), formatCurrency(expense.amount)]);
      runningTotal += expense.amount;
    }
  }

  rows.push(["", "", "", "", "Gesamt", formatCurrency(runningTotal)]);

  (doc as any).autoTable({
    startY: y,
    head: [["Datum", "Lieferant", "Produkt", "Kategorie", "Konto", "Betrag"]],
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
      0: { cellWidth: 20 },
      1: { cellWidth: 30 },
      2: { cellWidth: 35 },
      3: { cellWidth: 32 },
      4: { halign: "center", cellWidth: 16 },
      5: { halign: "right", cellWidth: 25 },
    },
    didParseCell: (data: any) => {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}
