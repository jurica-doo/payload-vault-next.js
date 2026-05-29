import { useState, useMemo } from "react";
import {
  type DropdownOptions,
  paycheckFilterOptions,
  monthOptions,
  isExpenseCategoryType,
} from "../../components/dropdown/DropdownOption";
import { Dropdown } from "../../components/dropdown/Dropdown";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";

import { formatAllPdfsExpenses } from "../allPdfs/utils";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { DocumentSkeletonLoader } from "../../components/skeletonLoader/DocumentSkeletonLoader";
import { Button } from "../../components/button/Button";
import { EmptyState } from "../../components/emptyState/EmptyState";
import JSZip from "jszip";
import { useBanner } from "../../context/banner/BannerContext";
import {
  isSortType,
  useFetchExpenses,
  useRemoveExpense,
  useUpdateExpense,
} from "../../hooks/useExpenses/useExpenses";
import {
  generateExpenseCsv,
  downloadCsv,
  buildCsvFileName,
} from "../../utils/csvExport";
import type { StoredProduct } from "../../hooks/useExpenses/types";
import { useModal } from "../../context/modal/ModalContext";
import { ExpenseEditForm } from "../../components/modal/ExpenseEditForm";
import { useCallback } from "react";

type CategoryProps = {
  title: string;
};

export const OtherExpensesPages = ({ title }: CategoryProps) => {
  const { user } = useAuth();
  const { year } = useYear();
  const params = window.location.pathname.split("/")[1];

  const [sortSelected, setSortSelected] = useState<
    DropdownOptions["paycheckFilter"][number]
  >(paycheckFilterOptions[0]);

  const [startMonthSelected, setStartMonthSelected] = useState<
    DropdownOptions["month"][number]
  >(monthOptions[0]);
  const [endMonthSelected, setEndMonthSelected] = useState<
    DropdownOptions["month"][number]
  >(monthOptions[monthOptions.length - 1]);


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
  const { openModal, closeModal } = useModal();

  const removeFile = useRemoveExpense();
  const updateExpense = useUpdateExpense();

  const { data, isLoading, error } = useFetchExpenses({
    userId: user?.id || "",
    year,
    startMonth: Number(startMonthSelected.id) || undefined,
    endMonth: Number(endMonthSelected.id) || undefined,
    sortBy: isSortType(sortSelected.id) ? sortSelected.id : "new",
  });

  const filteredData = useMemo(() => {
    if (!data) return undefined;
    const categoryTitle = isExpenseCategoryType(title) ? title : null;
    if (!categoryTitle) return data;

    return data.filter((expense) => {
      const products = Array.isArray(expense.products)
        ? (expense.products as StoredProduct[])
        : [];
      if (products.length > 0) {
        return products.some((p) => p.category === categoryTitle);
      }
      return expense.category === categoryTitle;
    });
  }, [data, title]);

  const contentCardData = useMemo(() => {
    if (!filteredData) return undefined;
    const categoryTitle = isExpenseCategoryType(title) ? title : undefined;
    return formatAllPdfsExpenses(filteredData, categoryTitle);
  }, [filteredData, title]);

  const handleEditExpense = useCallback(
    (id: string) => {
      const expense = data?.find((e) => e.id === id);
      if (!expense) return;

      const products = Array.isArray(expense.products)
        ? (expense.products as StoredProduct[])
        : [];

      openModal({
        title: "Beleg bearbeiten",
        size: "large",
        children: (
          <ExpenseEditForm
            expenseId={expense.id}
            fileName={expense.file_name}
            expenseDate={expense.expense_date}
            vendorName={expense.vendor_name || ""}
            products={products}
            onSave={async (payload) => {
              await updateExpense.mutateAsync(payload);
            }}
            onCancel={closeModal}
          />
        ),
      });
    },
    [data, openModal, closeModal, updateExpense],
  );

  const isFiltered = useMemo(() => {
    if (startMonthSelected.id !== "1") return true;
    if (endMonthSelected.id !== "12") return true;
    return false;
  }, [startMonthSelected, endMonthSelected]);

  if (!user) return <ErrorBlock />;

  const handleExportCsv = () => {
    if (!contentCardData || contentCardData.pdfs.length === 0) {
      showBanner(
        "Keine Daten zum Exportieren",
        "Es sind keine Daten zum CSV-Export verfügbar.",
        "error",
      );
      return;
    }

    const activeCategory = isExpenseCategoryType(title) ? title : undefined;
    const csvContent = generateExpenseCsv(contentCardData.pdfs, activeCategory);
    const csvName = buildCsvFileName([
      user.email ? user.email.split("@")[0] : null,
      "steuerrelevante-ausgaben",
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
      "steuerrelevante-ausgaben",
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
          if (!pdf.signed_url) return;

          const response = await fetch(pdf.signed_url);
          const blob = await response.blob();

          const fileName =
            pdf.file_name?.replace(/[^\w\d]+/g, "_") ||
            `document_${index + 1}.pdf`;

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
                title={pdf.file_name}
                date={pdf.expense_date}
                profit={pdf.amount}
                downloadLink={pdf.signed_url}
                openLink={pdf.signed_url}
                id={pdf.id}
                onDelete={(id) =>
                  removeFile.mutate({ id, imageUrl: pdf.image_url })
                }
                onEdit={handleEditExpense}
                products={pdf.products}
                vendorName={pdf.vendor_name}
                activeCategory={isExpenseCategoryType(title) ? title : undefined}
              />
            ))
          )}
        </div>
      )}
    </main>
  );
};
