"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { formatExpenses } from "./utils";
import type { FullData } from "./types";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { useTitle } from "../../context/title/TitleContext";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { ExpensePdfImportFooter } from "../../components/pdfImport/ExpensePdfImportFooter";

export const ExpensesPage = () => {
  const { user } = useAuth();
  const { year } = useYear();
  const [contentCardData, setContentCardData] = useState<
    FullData | undefined
  >();

  const { setTitle } = useTitle();

  useLayoutEffect(() => {
    setTitle("Steuerrelevante Ausgaben");
  }, [setTitle]);

  const {
    data: expenses,
    isLoading,
    error,
  } = useFetchExpenses({
    userId: user?.id || "",
    year,
  });

  useEffect(() => {
    if (expenses) {
      setContentCardData(formatExpenses(expenses));
    }
  }, [expenses]);

  if (!user) return <ErrorBlock />;

  if (error) return <ErrorBlock />;

  return (
    <div className="min-h-screen bg-color-bg">
      {isLoading || !contentCardData ? (
        <PageSkeletonLoader />
      ) : (
        <main className="flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-10 pb-25">
          <TotalIncomeCard
            title="Gesamtkosten"
            subtitle={contentCardData.totalPdf.toString() + " · Rechnungen"}
            totalIncome={contentCardData.totalIncome}
            variant="expense"
          />
          <ContentCard
            variant="allPdf"
            title={contentCardData.allPdfs.title}
            subtitle={contentCardData.allPdfs.subtitle}
            link={"/steuerrelevante-ausgaben/alle-dokumente"}
          />
          <h2 className="text-color-primary font-bold mx-auto">Kategorien</h2>
          <div className="flex flex-col gap-6">
            {contentCardData.allCategories.map((category, index) => (
              <ContentCard
                key={index}
                variant="category"
                title={category.category.title}
                subtitle={category.subtitle.toString() + " · Rechnungen"}
                profit={category.profit}
                link={
                  "/steuerrelevante-ausgaben/kategorie/" +
                  category.category.slug
                }
              />
            ))}
          </div>
        </main>
      )}

      <ExpensePdfImportFooter />
    </div>
  );
};
