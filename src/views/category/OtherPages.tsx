"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  type DropdownOptions,
  paycheckFilterOptions,
  monthOptions,
  isSortType,
  isCategoryType,
} from "../../components/dropdown/DropdownOption";
import { Dropdown } from "../../components/dropdown/Dropdown";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import type { AllPdfTypes } from "../allPdfs/types";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { formatAllPdfs } from "../allPdfs/utils";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { DocumentSkeletonLoader } from "../../components/skeletonLoader/DocumentSkeletonLoader";
import { Button } from "../../components/button/Button";
import { EmptyState } from "../../components/emptyState/EmptyState";
import JSZip from "jszip";
import { useBanner } from "../../context/banner/BannerContext";
import {
  generateIncomeCsv,
  downloadCsv,
  buildCsvFileName,
} from "../../utils/csvExport";

type CategoryProps = {
  title: string;
};

export const OtherPages = ({ title }: CategoryProps) => {
  const { user } = useAuth();
  const { year } = useYear();
  const pathname = usePathname();
  const params = pathname.split("/")[1];

  const [sortSelected, setSortSelected] = useState<
    DropdownOptions["paycheckFilter"][number]
  >(paycheckFilterOptions[0]);

  const [startMonthSelected, setStartMonthSelected] = useState<
    DropdownOptions["month"][number]
  >(monthOptions[0]);
  const [endMonthSelected, setEndMonthSelected] = useState<
    DropdownOptions["month"][number]
  >(monthOptions[monthOptions.length - 1]);

  const [contentCardData, setContentCardData] = useState<
    AllPdfTypes | undefined
  >();

  const endMonthOptions = useMemo(
    () => monthOptions.slice(monthOptions.indexOf(startMonthSelected)),
    [startMonthSelected],
  );

  const handleResetFilters = () => {
    setSortSelected(paycheckFilterOptions[0]);
    setStartMonthSelected(monthOptions[0]);
    setEndMonthSelected(monthOptions[monthOptions.length - 1]);
  };

  const { showBanner } = useBanner();

  const {
    data: pdfs,
    isLoading,
    error,
    removePdf,
  } = usePdfs({
    userId: user?.id || "",
    year,
    startMonth: Number(startMonthSelected.id) || undefined,
    endMonth: Number(endMonthSelected.id) || undefined,
    sortBy: isSortType(sortSelected.id) ? sortSelected.id : "new",
    category: isCategoryType(title) ? title : "all",
  });

  useEffect(() => {
    if (pdfs) {
      setContentCardData(formatAllPdfs(pdfs));
    }
  }, [pdfs]);

  const isFiltered = useMemo(() => {
    if (startMonthSelected.id !== "1") return true;
    if (endMonthSelected.id !== "12") return true;
    return false;
  }, [startMonthSelected, endMonthSelected]);

  if (!user) return <ErrorBlock />;

  const handleExportCsv = () => {
    if (!pdfs || pdfs.length === 0) {
      showBanner(
        "Keine Daten zum Exportieren",
        "Es sind keine Daten zum CSV-Export verfügbar.",
        "error",
      );
      return;
    }

    const csvContent = generateIncomeCsv(pdfs);
    const csvName = buildCsvFileName([
      user.email ? user.email.split("@")[0] : null,
      "einnahmen",
      startMonthSelected.label,
      endMonthSelected.id !== startMonthSelected.id
        ? `to_${endMonthSelected.label}`
        : null,
      `${year}`,
      title,
    ]);

    downloadCsv(csvContent, csvName);
    showBanner(
      "CSV-Export gestartet",
      "Deine Daten werden als CSV-Datei heruntergeladen.",
      "success",
    );
  };

  const handleDownloadAll = async () => {
    if (!contentCardData || contentCardData.pdfs.length === 0) {
      showBanner(
        "Keine PDFs zum Herunterladen",
        "Es sind keine PDFs zum Download verfügbar.",
        "error",
      );
      return;
    }

    const zip = new JSZip();

    const slugify = (value: string) =>
      value.toLowerCase().trim().replace(/\s+/g, "_");

    const zipName = [
      user.email ? user.email.split("@")[0] : null,
      "einnahmen",
      startMonthSelected.label,
      endMonthSelected.id !== startMonthSelected.id
        ? `to_${endMonthSelected.label}`
        : null,
      `${year}`,
      title,
    ]
      .filter((v): v is string => Boolean(v))
      .map(slugify)
      .join("_")
      .concat("_documents.zip");

    try {
      await Promise.all(
        contentCardData.pdfs.map(async (pdf, index) => {
          if (!pdf.signedUrl) return;

          const response = await fetch(pdf.signedUrl);
          const blob = await response.blob();

          const fileName =
            pdf.title?.replace(/[^\w\d]+/g, "_") || `document_${index + 1}.pdf`;

          zip.file(`${fileName}.pdf`, blob);
        }),
      );

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const url = window.URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipName;

      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showBanner(
        "Download gestartet",
        "Deine PDFs werden als ZIP-Datei heruntergeladen.",
        "success",
      );
    } catch (error) {
      showBanner(
        "PDF-Download fehlgeschlagen",
        "Beim Herunterladen der PDFs ist ein Fehler aufgetreten. Bitte versuche es erneut.",
        "error",
      );
      console.error(error);
    }
  };

  if (!contentCardData) return <PageSkeletonLoader />;

  if (error) return <ErrorBlock />;

  return (
    <main className="flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-10 pb-6">
      <TotalIncomeCard
        title={title}
        subtitle={
          contentCardData.totalPdf.toString() +
          " · " +
          (params === "einnahmen" ? "Abrechnungen" : "Rechnungen")
        }
        totalIncome={contentCardData.totalIncome}
        variant={params === "einnahmen" ? "income" : "expense"}
      />
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1">
          <Dropdown
            label="Sortieren nach"
            options={paycheckFilterOptions}
            onSelect={setSortSelected}
            value={sortSelected}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <Dropdown
            label="Startmonat auswählen"
            options={monthOptions}
            onSelect={setStartMonthSelected}
            value={startMonthSelected}
          />
          <Dropdown
            label="Endmonat auswählen"
            options={endMonthOptions}
            onSelect={setEndMonthSelected}
            value={endMonthSelected}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 items-center gap-3">
        <Button
          onClick={handleResetFilters}
          text="Filter zurücksetzen"
          size="medium"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={handleDownloadAll}
            variant="secondary"
            text={
              isFiltered
                ? "Gefilterte Dokumente herunterladen"
                : "Alle Dokumente herunterladen"
            }
            size="medium"
          />
          <Button
            onClick={handleExportCsv}
            variant="secondary"
            text={
              isFiltered
                ? "Gefilterte Daten als CSV exportieren"
                : "Alle Daten als CSV exportieren"
            }
            size="medium"
          />
        </div>
      </div>
      {isLoading ? (
        <DocumentSkeletonLoader />
      ) : (
        <div className="flex flex-col gap-6">
          {contentCardData.pdfs.length === 0 ? (
            <EmptyState
              message="Keine Dokumente gefunden"
              hint="Versuche andere Filter oder lade ein neues Dokument hoch."
            />
          ) : (
            contentCardData.pdfs.map((pdf, index) => (
              <ContentCard
                key={pdf.id || index}
                variant="document"
                title={pdf.title}
                date={pdf.date}
                profit={pdf.income}
                downloadLink={pdf.signedUrl}
                openLink={pdf.openLink}
                id={pdf.id}
                onDelete={(id) => removePdf.mutate(id)}
              />
            ))
          )}
        </div>
      )}
    </main>
  );
};
