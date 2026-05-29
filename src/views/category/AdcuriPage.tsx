import { useState, useEffect } from "react";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { formatAdcuriData } from "./utils";
import type { AdcuriFullData } from "./types";

export const AdcuriPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const [contentCardData, setContentCardData] = useState<
    AdcuriFullData | undefined
  >();

  if (!user) return <ErrorBlock />;

  const {
    data: pdfs,
    isLoading,
    error,
  } = usePdfs({
    userId: user.id,
    year,
  });

  useEffect(() => {
    if (pdfs) {
      setContentCardData(formatAdcuriData(pdfs));
    }
  }, [pdfs]);

  if (isLoading || !contentCardData) return <PageSkeletonLoader />;

  if (error) return <ErrorBlock />;

  return (
    <main className="flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-10 pb-6">
      <TotalIncomeCard
        title="Adcuri Gesamteinnahmen"
        subtitle={contentCardData.totalPdf.toString() + " · Abrechnungen"}
        totalIncome={contentCardData.totalIncome}
      />
      <div className="flex flex-col gap-6">
        {contentCardData.adcuriCategories.map((category, index) => (
          <ContentCard
            key={index}
            variant="category"
            title={category.category.title}
            subtitle={category.subtitle.toString() + " · Abrechnungen"}
            profit={category.profit}
            link={category.category.slug.split("/")[1]}
          />
        ))}
      </div>
    </main>
  );
};
