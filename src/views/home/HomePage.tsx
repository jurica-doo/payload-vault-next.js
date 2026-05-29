"use client";

import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { HeaderHome } from "../../components/header/HeaderHome";
import { useAuth } from "../../context/AuthContext";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { useYear } from "../../hooks/year/UseYear";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { formatExpenses } from "../expenses/utils";
import { formatData } from "./utils";
import { MiniFooter } from "../../components/footer/MiniFooter";

export const HomePage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const {
    data: expenses,
    isLoading: isLoadingExpenses,
    error: errorExpenses,
  } = useFetchExpenses({
    userId: user?.id || "",
    year,
  });

  const {
    data: pdfs,
    isLoading: isLoadingPdfs,
    error: errorPdfs,
  } = usePdfs({
    userId: user?.id || "",
    year,
  });

  const contentCardData = {
    totalPdf: pdfs ? formatData(pdfs).totalPdf : 0,
    totalExpensePdf: expenses ? formatExpenses(expenses).totalPdf : 0,
    totalIncome: pdfs ? formatData(pdfs).totalIncome : 0,
    totalExpanse: expenses ? formatExpenses(expenses).totalIncome : 0,
    allCategories: expenses ? formatExpenses(expenses).allCategories : [],
  };

  if (!user || !year || errorExpenses || errorPdfs) return <ErrorBlock />;

  return (
    <div className="flex flex-col min-h-screen bg-color-bg">
      {isLoadingExpenses || isLoadingPdfs || !expenses || !pdfs ? (
        <PageSkeletonLoader />
      ) : (
        <>
          <div className="sticky top-0 z-40">
            <HeaderHome isSticky={false} />
          </div>
          <main className="flex-1 flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-10 pb-25">
            <TotalIncomeCard
              title="Gesamteinnahmen"
              subtitle={contentCardData.totalPdf + " · Abrechnungen"}
              totalIncome={contentCardData.totalIncome}
            />
            <TotalIncomeCard
              variant="expense"
              title="Gesamtkosten"
              subtitle={contentCardData.totalExpensePdf + " · Rechnungen"}
              totalIncome={contentCardData.totalExpanse}
            />
            <h2 className="text-color-primary font-bold mx-auto">Kategorien</h2>
            <div className="flex flex-col gap-6">
              <ContentCard
                variant="category"
                title="Einnahmen"
                subtitle={contentCardData.totalPdf + " · Abrechnungen"}
                profit={contentCardData.totalIncome}
                link="/einnahmen"
              />
              <ContentCard
                variant="category"
                title="Steuerrelevante Ausgaben"
                subtitle={contentCardData.totalExpensePdf + " · Rechnungen"}
                profit={contentCardData.totalExpanse}
                link="/steuerrelevante-ausgaben"
              />
            </div>
          </main>
          <MiniFooter />
        </>
      )}
    </div>
  );
};
