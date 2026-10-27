import { useMemo } from "react";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { formatAdcuriData } from "./utils";

export const AdcuriPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const {
    data: pdfs,
    isLoading,
    error,
  } = usePdfs({
    userId: user?.id || "",
    year,
  });

  const contentCardData = useMemo(
    () => (pdfs ? formatAdcuriData(pdfs) : undefined),
    [pdfs],
  );

  if (!user) return <ErrorBlock />;

  if (error) return <ErrorBlock />;

  if (isLoading || !contentCardData) return <PageSkeletonLoader />;

  return (
    <div className="flex flex-col gap-6">
      <TotalIncomeCard
        title="Adcuri Gesamteinnahmen"
        subtitle={contentCardData.totalPdf.toString() + " Abrechnungen"}
        totalIncome={contentCardData.totalIncome}
      />
      <div className="grid gap-3 md:grid-cols-2 stagger">
        {contentCardData.adcuriCategories.map((category, index) => (
          <ContentCard
            key={index}
            variant="category"
            title={category.category.title}
            subtitle={category.subtitle.toString() + " Abrechnungen"}
            profit={category.profit}
            link={`/einnahmen/kategorie/${category.category.slug}`}
          />
        ))}
      </div>
    </div>
  );
};
