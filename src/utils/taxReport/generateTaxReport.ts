import type { PdfRecord } from "../../hooks/usePdf/types";
import type { ExpenseRecord } from "../../hooks/useExpenses/types";
import {
  addPageDecorations,
  loadLogoAsset,
  sanitizeEmailForFilename,
} from "./helpers";
import { addHeaderSection } from "./sections/headerSection";
import { addCategorySummarySection } from "./sections/categorySummarySection";
import { addMonthlyBreakdownSection } from "./sections/monthlyBreakdownSection";
import { addIncomeDetailSection } from "./sections/incomeDetailSection";
import { addExpenseDetailSection } from "./sections/expenseDetailSection";
import { addKontoReferenceSection } from "./sections/kontoReferenceSection";

export async function generateTaxReport(
  pdfs: PdfRecord[],
  expenses: ExpenseRecord[],
  year: number,
  userEmail: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { applyPlugin } = await import("jspdf-autotable");
  applyPlugin(jsPDF);

  const logo = await loadLogoAsset();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Page 1: Header + Summary + Category breakdowns
  const headerY = addHeaderSection(doc, year, pdfs, expenses, userEmail);
  addCategorySummarySection(doc, pdfs, expenses, headerY);

  // Page 2: Monthly breakdowns
  doc.addPage();
  addMonthlyBreakdownSection(doc, pdfs, expenses);

  // Page 3+: Income detail
  doc.addPage();
  addIncomeDetailSection(doc, pdfs);

  // Page N+: Expense detail
  doc.addPage();
  addExpenseDetailSection(doc, expenses);

  // Final page: KONTO reference
  doc.addPage();
  addKontoReferenceSection(doc);

  // Decorate every page (logo + footer)
  addPageDecorations(doc, year, logo);

  const prefix = sanitizeEmailForFilename(userEmail);
  doc.save(`${prefix}_steuerbericht_${year}.pdf`);
}
