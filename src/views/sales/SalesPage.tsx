"use client";

import { useMemo, useLayoutEffect } from "react";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { PageHeader } from "../../components/pageHeader/PageHeader";
import { SectionHeading } from "../../components/sectionHeading/SectionHeading";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { formatData } from "./utils";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { useTitle } from "../../context/title/TitleContext";

export const SalesPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const { setTitle } = useTitle();

  useLayoutEffect(() => {
    setTitle("Einnahmen");
  }, [setTitle]);

  const {
    data: pdfs,
    isLoading,
    error,
  } = usePdfs({
    userId: user?.id || "",
    year,
  });

  // Derived directly from the query result — no state+effect, so switching
  // the year can never show the previous year's numbers.
  const contentCardData = useMemo(
    () => (pdfs ? formatData(pdfs) : undefined),
    [pdfs],
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
            title="Einnahmen"
            description="Provisions- und Abrechnungsdokumente, nach Gesellschaft geordnet."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TotalIncomeCard
              title="Gesamteinnahmen"
              subtitle={contentCardData.totalPdf.toString() + " Abrechnungen"}
              totalIncome={contentCardData.totalIncome}
            />
            <ContentCard
              variant="allPdf"
              title={contentCardData.allPdfs.title}
              subtitle={contentCardData.allPdfs.subtitle}
              link={"/einnahmen" + contentCardData.allPdfs.link}
            />
          </div>
          <SectionHeading>Kategorien</SectionHeading>
          <div className="-mt-4 grid gap-3 md:grid-cols-2 stagger">
            {contentCardData.allCategories.map((category, index) => (
              <ContentCard
                key={index}
                variant="category"
                title={category.category.title}
                subtitle={category.subtitle.toString() + " Abrechnungen"}
                profit={category.profit}
                link={"/einnahmen/kategorie/" + category.category.slug}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
};
