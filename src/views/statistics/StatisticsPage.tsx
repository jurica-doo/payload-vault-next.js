"use client";

import { useMemo } from "react";
import type React from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/pageHeader/PageHeader";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { SectionHeading } from "../../components/sectionHeading/SectionHeading";
import { LinkCard } from "../../components/linkCard/LinkCard";
import { TrendIcon } from "../../components/icons";
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

  const shell = (content: React.ReactNode) => (
    <AppShell title="Statistiken" subtitle={`Geschäftsjahr ${year}`} showYearSelector>
      {content}
    </AppShell>
  );

  if (!user || !year || errorPdfs || errorExpenses) return shell(<ErrorBlock />);

  const isLoading = isLoadingPdfs || isLoadingExpenses || !pdfs || !expenses;

  if (isLoading) return shell(<PageSkeletonLoader />);

  return shell(
            <div className="space-y-8">
              <PageHeader
                title="Statistiken"
                description="Einnahmen und Ausgaben des Geschäftsjahres im Überblick."
                actions={<TaxReportButton pdfs={pdfs} expenses={expenses} year={year} />}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 stagger">
                <KpiTile
                  label="Gesamteinnahmen"
                  value={<span className="text-color-text-accent">{normalizeProfit(totalEarnings)} €</span>}
                  hint={`${pdfs.length} Abrechnungen`}
                />
                <KpiTile
                  label="Gesamtausgaben"
                  value={`${normalizeProfit(totalExpenses)} €`}
                  hint={`${expenses.length} Rechnungen`}
                />
              </div>

              {/* ── Earnings Section ───────────────────────────────── */}
              <section className="space-y-4">
                <SectionHeading tone="primary">Einnahmen</SectionHeading>

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
              <section className="space-y-4">
                <SectionHeading tone="accent">Ausgaben</SectionHeading>

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

              <LinkCard
                href="/analysen"
                icon={TrendIcon}
                title="Erweiterte Analysen"
                description="Ausgabenprognosen, Kategorie-Budgets & Einnahmen-Ziele"
              />
            </div>,
  );
};
