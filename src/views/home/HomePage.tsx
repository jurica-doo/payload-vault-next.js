"use client";

import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { type ReactNode } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { PageHeader } from "../../components/pageHeader/PageHeader";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { LinkCard } from "../../components/linkCard/LinkCard";
import { SectionHeading } from "../../components/sectionHeading/SectionHeading";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";
import {
  ChartBarIcon,
  ReceiptIcon,
  TrendIcon,
  UploadIcon,
  WalletIcon,
} from "../../components/icons";
import { useAuth } from "../../context/AuthContext";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { useYear } from "../../hooks/year/UseYear";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { formatExpenses } from "../expenses/utils";
import { formatData } from "./utils";

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

  const shell = (content: ReactNode) => (
    <AppShell title="Übersicht" subtitle={`Geschäftsjahr ${year}`} showYearSelector>
      {content}
    </AppShell>
  );

  if (!user || !year || errorExpenses || errorPdfs) return shell(<ErrorBlock />);

  if (isLoadingExpenses || isLoadingPdfs || !expenses || !pdfs)
    return shell(<PageSkeletonLoader />);

  const balance = contentCardData.totalIncome - contentCardData.totalExpanse;
  const isEmpty =
    contentCardData.totalPdf === 0 && contentCardData.totalExpensePdf === 0;

  return shell(
    <div className="flex flex-col gap-8">
      <PageHeader
        title={greeting()}
        description={`Ihr Überblick über Einnahmen und steuerrelevante Ausgaben im Geschäftsjahr ${year}.`}
      />

      <div className="grid gap-4 md:grid-cols-3 stagger">
        <TotalIncomeCard
          title="Gesamteinnahmen"
          subtitle={`${contentCardData.totalPdf} Abrechnungen`}
          totalIncome={contentCardData.totalIncome}
        />
        <TotalIncomeCard
          variant="expense"
          title="Steuerrelevante Ausgaben"
          subtitle={`${contentCardData.totalExpensePdf} Rechnungen`}
          totalIncome={contentCardData.totalExpanse}
        />
        <KpiTile
          label="Saldo"
          value={
            <span className={balance >= 0 ? "text-color-text-main" : "text-color-error-text"}>
              {normalizeProfit(balance)} €
            </span>
          }
          hint="Einnahmen abzüglich Ausgaben"
        />
      </div>

      {isEmpty ? (
        <div className="ui-card">
          <EmptyState
            icon={UploadIcon}
            message="Noch keine Dokumente für dieses Jahr"
            hint="Laden Sie Ihre erste Abrechnung unter „Einnahmen“ hoch – Beträge und Kategorien werden automatisch erkannt."
          />
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionHeading>Bereiche</SectionHeading>
        <div className="grid gap-3 md:grid-cols-2 stagger">
          <LinkCard
            href="/einnahmen"
            icon={WalletIcon}
            title="Einnahmen"
            description={`${contentCardData.totalPdf} Abrechnungen · nach Gesellschaft sortiert`}
            meta={
              <span className="tabular text-sm font-semibold text-color-text-main">
                {normalizeProfit(contentCardData.totalIncome)} €
              </span>
            }
          />
          <LinkCard
            href="/steuerrelevante-ausgaben"
            icon={ReceiptIcon}
            title="Steuerrelevante Ausgaben"
            description={`${contentCardData.totalExpensePdf} Rechnungen · nach Kategorie`}
            meta={
              <span className="tabular text-sm font-semibold text-color-text-main">
                {normalizeProfit(contentCardData.totalExpanse)} €
              </span>
            }
          />
          <LinkCard
            href="/statistiken"
            icon={ChartBarIcon}
            title="Statistiken"
            description="Monatsverlauf, Kategorien und Steuerbericht"
          />
          <LinkCard
            href="/analysen"
            icon={TrendIcon}
            title="Analysen"
            description="Prognosen, Budgets und Einnahmen-Ziele"
          />
        </div>
      </section>
    </div>,
  );
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
};
