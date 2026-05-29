"use client";

import { useMemo } from "react";
import Link from "next/link";
import { HeaderHome } from "../../components/header/HeaderHome";
import { MiniFooter } from "../../components/footer/MiniFooter";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";
import { MonthlyChart } from "./MonthlyChart";
import { CategoryChart } from "./CategoryChart";
import { SummaryTable } from "./SummaryTable";
import {
  aggregateEarningsByMonth,
  aggregateEarningsByCategory,
  getEarningsSummary,
  aggregateExpensesByMonth,
  aggregateExpensesByCategory,
  getExpensesSummary,
} from "./utils";
import { TaxReportButton } from "../../components/taxReport/TaxReportButton";

export const StatisticsPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const {
    data: pdfs,
    isLoading: isLoadingPdfs,
    error: errorPdfs,
  } = usePdfs({ userId: user?.id || "", year });

  const {
    data: expenses,
    isLoading: isLoadingExpenses,
    error: errorExpenses,
  } = useFetchExpenses({ userId: user?.id || "", year });

  // Earnings aggregations
  const earningsMonthly = useMemo(
    () => (pdfs ? aggregateEarningsByMonth(pdfs) : []),
    [pdfs],
  );
  const earningsByCategory = useMemo(
    () => (pdfs ? aggregateEarningsByCategory(pdfs) : []),
    [pdfs],
  );
  const earningsSummary = useMemo(
    () =>
      pdfs
        ? getEarningsSummary(pdfs)
        : {
            bestMonth: null,
            worstMonth: null,
            bestCategory: null,
            worstCategory: null,
          },
    [pdfs],
  );
  const totalEarnings = useMemo(
    () => (pdfs ? pdfs.reduce((sum, p) => sum + p.profit, 0) : 0),
    [pdfs],
  );

  // Expenses aggregations
  const expensesMonthly = useMemo(
    () => (expenses ? aggregateExpensesByMonth(expenses) : []),
    [expenses],
  );
  const expensesByCategory = useMemo(
    () => (expenses ? aggregateExpensesByCategory(expenses) : []),
    [expenses],
  );
  const expensesSummary = useMemo(
    () =>
      expenses
        ? getExpensesSummary(expenses)
        : {
            bestMonth: null,
            worstMonth: null,
            bestCategory: null,
            worstCategory: null,
          },
    [expenses],
  );
  const totalExpenses = useMemo(
    () => (expenses ? expenses.reduce((sum, e) => sum + e.amount, 0) : 0),
    [expenses],
  );

  if (!user || !year || errorPdfs || errorExpenses) return <ErrorBlock />;

  const isLoading = isLoadingPdfs || isLoadingExpenses || !pdfs || !expenses;

  return (
    <div className="flex flex-col min-h-screen bg-color-bg-main">
      {isLoading ? (
        <PageSkeletonLoader />
      ) : (
        <>
          <div className="sticky top-0 z-40">
            <HeaderHome
              isTwoHeaders
              isSticky={false}
              pageTitle="Statistiken"
              pageSubtitle={year.toString()}
            />
          </div>

          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-10 pb-10">
              {/* ── Overview Cards ──────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slide-up">
                <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-5 flex flex-col gap-1 transition-all duration-200 hover:shadow-shadow-medium">
                  <span className="text-xs text-color-text-subtle uppercase tracking-wide">
                    Gesamteinnahmen
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-color-primary">
                    {normalizeProfit(totalEarnings)} €
                  </span>
                  <span className="text-xs text-color-text-subtle">
                    {pdfs.length} Abrechnungen
                  </span>
                </div>

                <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-5 flex flex-col gap-1 transition-all duration-200 hover:shadow-shadow-medium">
                  <span className="text-xs text-color-text-subtle uppercase tracking-wide">
                    Gesamtausgaben
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-color-error-text">
                    {normalizeProfit(totalExpenses)} €
                  </span>
                  <span className="text-xs text-color-text-subtle">
                    {expenses.length} Rechnungen
                  </span>
                </div>
              </div>

              {/* ── Tax Report Button ─────────────────────────────── */}
              <div className="flex justify-end animate-slide-up">
                <TaxReportButton pdfs={pdfs} expenses={expenses} year={year} />
              </div>

              {/* ── Earnings Section ───────────────────────────────── */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-color-primary rounded-full" />
                  <h3 className="text-lg sm:text-xl font-bold text-color-text-main">
                    Einnahmen
                  </h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <MonthlyChart
                    data={earningsMonthly}
                    color="var(--color-primary)"
                    label="Monatliche Einnahmen"
                  />
                  <CategoryChart
                    data={earningsByCategory}
                    label="Einnahmen nach Kategorie"
                  />
                </div>

                <SummaryTable stats={earningsSummary} variant="income" />
              </section>

              {/* ── Expenses Section ───────────────────────────────── */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-color-error rounded-full" />
                  <h3 className="text-lg sm:text-xl font-bold text-color-text-main">
                    Ausgaben
                  </h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <MonthlyChart
                    data={expensesMonthly}
                    color="var(--color-error)"
                    label="Monatliche Ausgaben"
                  />
                  <CategoryChart
                    data={expensesByCategory}
                    label="Ausgaben nach Kategorie"
                  />
                </div>

                <SummaryTable stats={expensesSummary} variant="expense" />
              </section>

              {/* Link to Advanced Analytics */}
              <Link
                href="/analysen"
                className="block bg-color-bg-card border border-color-border-light rounded-radius-lg p-5
                  hover:shadow-shadow-medium hover:border-color-primary/40 transition-all duration-200
                  group animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-color-text-main group-hover:text-color-primary transition-colors">
                      Erweiterte Analysen
                    </h4>
                    <p className="text-xs text-color-text-subtle mt-0.5">
                      Ausgabenprognosen, Kategorie-Budgets & Einnahmen-Ziele
                    </p>
                  </div>
                  <span className="text-color-text-subtle group-hover:text-color-primary transition-colors text-lg">
                    →
                  </span>
                </div>
              </Link>
            </div>

            <MiniFooter />
          </main>
        </>
      )}
    </div>
  );
};
