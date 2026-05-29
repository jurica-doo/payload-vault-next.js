import type { PdfRecord } from "../../hooks/usePdf/types";
import type { ExpenseRecord, StoredProduct } from "../../hooks/useExpenses/types";

// German month names
const MONTH_NAMES = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

const MONTH_FULL_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// Chart color palette that works in both light and dark themes
const CHART_COLORS = [
  "#00c4b3", "#be9b53", "#6366f1", "#f43f5e",
  "#22d3ee", "#a855f7", "#f97316", "#84cc16",
  "#ec4899", "#14b8a6",
];

type MonthlyData = {
  month: string;
  monthIndex: number;
  total: number;
};

type CategoryTotal = {
  category: string;
  total: number;
  color: string;
};

type SummaryStats = {
  bestMonth: { name: string; value: number } | null;
  worstMonth: { name: string; value: number } | null;
  bestCategory: { name: string; value: number } | null;
  worstCategory: { name: string; value: number } | null;
};

// ── Earnings aggregation ─────────────────────────────────────────────────────

function aggregateEarningsByMonth(pdfs: PdfRecord[]): MonthlyData[] {
  const monthMap = new Map<number, number>();

  pdfs.forEach((pdf) => {
    const date = new Date(pdf.date_created);
    const monthIdx = date.getMonth();
    monthMap.set(monthIdx, (monthMap.get(monthIdx) ?? 0) + pdf.profit);
  });

  // Return all 12 months, filling empty ones with 0
  return Array.from({ length: 12 }, (_, i) => ({
    month: MONTH_NAMES[i],
    monthIndex: i,
    total: monthMap.get(i) ?? 0,
  }));
}

function aggregateEarningsByCategory(pdfs: PdfRecord[]): CategoryTotal[] {
  const catMap = new Map<string, number>();

  pdfs.forEach((pdf) => {
    // Group Adcuri subcategories together
    const cat =
      pdf.category === "Adcuri Abschlussprovision" ||
      pdf.category === "Adcuri Bestandsprovision"
        ? "Adcuri"
        : pdf.category;
    catMap.set(cat, (catMap.get(cat) ?? 0) + pdf.profit);
  });

  const entries = Array.from(catMap.entries())
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1]);

  return entries.map(([category, total], i) => ({
    category,
    total,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

function getEarningsSummary(pdfs: PdfRecord[]): SummaryStats {
  const monthly = aggregateEarningsByMonth(pdfs).filter((m) => m.total > 0);
  const byCategory = aggregateEarningsByCategory(pdfs);

  return {
    bestMonth: monthly.length
      ? (() => { const m = monthly.reduce((a, b) => (b.total > a.total ? b : a)); return { name: MONTH_FULL_NAMES[m.monthIndex], value: m.total }; })()
      : null,
    worstMonth: monthly.length
      ? (() => { const m = monthly.reduce((a, b) => (b.total < a.total ? b : a)); return { name: MONTH_FULL_NAMES[m.monthIndex], value: m.total }; })()
      : null,
    bestCategory: byCategory.length
      ? { name: byCategory[0].category, value: byCategory[0].total }
      : null,
    worstCategory: byCategory.length
      ? { name: byCategory[byCategory.length - 1].category, value: byCategory[byCategory.length - 1].total }
      : null,
  };
}

// ── Expenses aggregation ─────────────────────────────────────────────────────

function aggregateExpensesByMonth(expenses: ExpenseRecord[]): MonthlyData[] {
  const monthMap = new Map<number, number>();

  expenses.forEach((expense) => {
    const date = new Date(expense.expense_date);
    const monthIdx = date.getMonth();
    monthMap.set(monthIdx, (monthMap.get(monthIdx) ?? 0) + expense.amount);
  });

  return Array.from({ length: 12 }, (_, i) => ({
    month: MONTH_NAMES[i],
    monthIndex: i,
    total: monthMap.get(i) ?? 0,
  }));
}

function aggregateExpensesByCategory(expenses: ExpenseRecord[]): CategoryTotal[] {
  const catMap = new Map<string, number>();

  expenses.forEach((expense) => {
    const products = Array.isArray(expense.products)
      ? (expense.products as StoredProduct[])
      : [];

    if (products.length > 0) {
      products.forEach((product) => {
        catMap.set(product.category, (catMap.get(product.category) ?? 0) + product.amount);
      });
    } else {
      catMap.set(expense.category, (catMap.get(expense.category) ?? 0) + expense.amount);
    }
  });

  const entries = Array.from(catMap.entries())
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1]);

  return entries.map(([category, total], i) => ({
    category,
    total,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

function getExpensesSummary(expenses: ExpenseRecord[]): SummaryStats {
  const monthly = aggregateExpensesByMonth(expenses).filter((m) => m.total > 0);
  const byCategory = aggregateExpensesByCategory(expenses);

  return {
    bestMonth: monthly.length
      ? (() => { const m = monthly.reduce((a, b) => (b.total > a.total ? b : a)); return { name: MONTH_FULL_NAMES[m.monthIndex], value: m.total }; })()
      : null,
    worstMonth: monthly.length
      ? (() => { const m = monthly.reduce((a, b) => (b.total < a.total ? b : a)); return { name: MONTH_FULL_NAMES[m.monthIndex], value: m.total }; })()
      : null,
    bestCategory: byCategory.length
      ? { name: byCategory[0].category, value: byCategory[0].total }
      : null,
    worstCategory: byCategory.length
      ? { name: byCategory[byCategory.length - 1].category, value: byCategory[byCategory.length - 1].total }
      : null,
  };
}

export {
  MONTH_NAMES,
  MONTH_FULL_NAMES,
  CHART_COLORS,
  aggregateEarningsByMonth,
  aggregateEarningsByCategory,
  getEarningsSummary,
  aggregateExpensesByMonth,
  aggregateExpensesByCategory,
  getExpensesSummary,
};

export type { MonthlyData, CategoryTotal, SummaryStats };
