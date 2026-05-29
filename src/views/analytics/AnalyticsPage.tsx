"use client";

import { HeaderHome } from "../../components/header/HeaderHome";
import { MiniFooter } from "../../components/footer/MiniFooter";
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

  if (!user || !year || errorPdfs || errorExpenses) return <ErrorBlock />;

  const isLoading =
    isLoadingPdfs ||
    isLoadingPrevPdfs ||
    isLoadingExpenses ||
    isLoadingBudgets ||
    isLoadingGoals ||
    !pdfs ||
    !expenses;

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
              pageTitle="Erweiterte Analysen"
              pageSubtitle={year.toString()}
            />
          </div>

          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-8 pb-10">
              {/* Section: Income Forecasting */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-color-primary rounded-full" />
                  <h3 className="text-lg sm:text-xl font-bold text-color-text-main">
                    Einnahmenprognose
                  </h3>
                </div>
                <IncomeForecast
                  pdfs={pdfs}
                  previousYearPdfs={previousYearPdfs ?? []}
                  year={year}
                />
              </section>

              {/* Section: Category Budget Targets */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-color-error rounded-full" />
                  <h3 className="text-lg sm:text-xl font-bold text-color-text-main">
                    Kategorie-Budgets
                  </h3>
                </div>
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
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-color-primary rounded-full" />
                  <h3 className="text-lg sm:text-xl font-bold text-color-text-main">
                    Einnahmen-Ziele
                  </h3>
                </div>
                <IncomeGoalTracking
                  pdfs={pdfs}
                  incomeGoals={incomeGoals ?? []}
                  year={year}
                  onUpsert={handleGoalUpsert}
                  onRemove={handleGoalRemove}
                />
              </section>
            </div>

            <MiniFooter />
          </main>
        </>
      )}
    </div>
  );
};
