"use client";

import type React from "react";

import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/pageHeader/PageHeader";
import { SectionHeading } from "../../components/sectionHeading/SectionHeading";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { useBudgetTargets } from "../../hooks/useAnalytics/useBudgetTargets";
import { useIncomeGoals } from "../../hooks/useAnalytics/useIncomeGoals";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { IncomeForecast } from "./IncomeForecast";
import { BudgetTargets } from "./BudgetTargets";
import { IncomeGoalTracking } from "./IncomeGoalTracking";
import type { ExpenseCategory } from "../../hooks/useExpenses/types";

export const AnalyticsPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const {
    data: pdfs,
    isLoading: isLoadingPdfs,
    error: errorPdfs,
  } = usePdfs({ userId: user?.id || "", year });

  // Fetch previous year data for improved forecast accuracy
  const { data: previousYearPdfs, isLoading: isLoadingPrevPdfs } = usePdfs({
    userId: user?.id || "",
    year: year - 1,
  });

  const {
    data: expenses,
    isLoading: isLoadingExpenses,
    error: errorExpenses,
  } = useFetchExpenses({ userId: user?.id || "", year });

  const {
    data: budgetTargets,
    isLoading: isLoadingBudgets,
    upsertTarget,
    removeTarget,
  } = useBudgetTargets(user?.id || "", year);

  const {
    data: incomeGoals,
    isLoading: isLoadingGoals,
    upsertGoal,
    removeGoal,
  } = useIncomeGoals(user?.id || "", year);

  const handleBudgetUpsert = (category: ExpenseCategory, amount: number) => {
    if (!user) return;
    upsertTarget.mutate({
      user_id: user.id,
      year,
      category,
      budget_amount: amount,
    });
  };

  const handleBudgetRemove = (id: string) => {
    removeTarget.mutate(id);
  };

  const handleGoalUpsert = (month: number | null, amount: number) => {
    if (!user) return;
    upsertGoal.mutate({
      user_id: user.id,
      year,
      month,
      goal_amount: amount,
    });
  };

  const handleGoalRemove = (id: string) => {
    removeGoal.mutate(id);
  };

  const shell = (content: React.ReactNode) => (
    <AppShell title="Analysen" subtitle={`Geschäftsjahr ${year}`} showYearSelector>
      {content}
    </AppShell>
  );

  if (!user || !year || errorPdfs || errorExpenses) return shell(<ErrorBlock />);

  const isLoading =
    isLoadingPdfs ||
    isLoadingPrevPdfs ||
    isLoadingExpenses ||
    isLoadingBudgets ||
    isLoadingGoals ||
    !pdfs ||
    !expenses;

  if (isLoading) return shell(<PageSkeletonLoader />);

  return shell(
            <div className="space-y-10">
              <PageHeader
                title="Erweiterte Analysen"
                description="Prognosen, Kategorie-Budgets und Einnahmen-Ziele für das gewählte Geschäftsjahr."
              />
              {/* Section: Income Forecasting */}
              <section className="space-y-4">
                <SectionHeading tone="primary">Einnahmenprognose</SectionHeading>
                <IncomeForecast
                  pdfs={pdfs}
                  previousYearPdfs={previousYearPdfs ?? []}
                  year={year}
                />
              </section>

              {/* Section: Category Budget Targets */}
              <section className="space-y-4">
                <SectionHeading tone="accent">Kategorie-Budgets</SectionHeading>
                <BudgetTargets
                  expenses={expenses}
                  budgetTargets={budgetTargets ?? []}
                  year={year}
                  onUpsert={handleBudgetUpsert}
                  onRemove={handleBudgetRemove}
                />
              </section>

              {/* Section: Income Goal Tracking */}
              <section className="space-y-4">
                <SectionHeading tone="primary">Einnahmen-Ziele</SectionHeading>
                <IncomeGoalTracking
                  pdfs={pdfs}
                  incomeGoals={incomeGoals ?? []}
                  year={year}
                  onUpsert={handleGoalUpsert}
                  onRemove={handleGoalRemove}
                />
              </section>
            </div>,
  );
};
