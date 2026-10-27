"use client";

import { useMemo, useLayoutEffect } from "react";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { formatExpenses } from "./utils";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { useTitle } from "../../context/title/TitleContext";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { PageHeader } from "../../components/pageHeader/PageHeader";
import { SectionHeading } from "../../components/sectionHeading/SectionHeading";

export const ExpensesPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

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

  // Derived directly from the query result — no state+effect, so switching
  // the year can never show the previous year's numbers.
  const contentCardData = useMemo(
    () => (expenses ? formatExpenses(expenses) : undefined),
    [expenses],
  );

  if (!user) return <ErrorBlock />;

  if (error) return <ErrorBlock />;

  return (
    <>
      {isLoading || !contentCardData ? (
        <PageSkeletonLoader />
      ) : (
        <div className="flex flex-col gap-8">
          <PageHeader
            title="Steuerrelevante Ausgaben"
            description="Rechnungen und Belege – per Foto oder PDF erfasst, automatisch kategorisiert."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TotalIncomeCard
              title="Gesamtkosten"
              subtitle={contentCardData.totalPdf.toString() + " Rechnungen"}
              totalIncome={contentCardData.totalIncome}
              variant="expense"
            />
            <ContentCard
              variant="allPdf"
              title={contentCardData.allPdfs.title}
              subtitle={contentCardData.allPdfs.subtitle}
              link={"/steuerrelevante-ausgaben/alle-dokumente"}
            />
          </div>
          <SectionHeading>Kategorien</SectionHeading>
          <div className="-mt-4 grid gap-3 md:grid-cols-2 stagger">
            {contentCardData.allCategories.map((category, index) => (
              <ContentCard
                key={index}
                variant="category"
                title={category.category.title}
                subtitle={category.subtitle.toString() + " Rechnungen"}
                profit={category.profit}
                link={
                  "/steuerrelevante-ausgaben/kategorie/" +
                  category.category.slug
                }
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
};
