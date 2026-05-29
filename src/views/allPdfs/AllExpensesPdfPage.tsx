"use client";

import JSZip from "jszip";
import { usePathname } from "next/navigation";
import { useTitle } from "../../context/title/TitleContext";
import {
  useLayoutEffect,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  type DropdownOptions,
  paycheckFilterOptions,
  monthOptions,
  categoryExpenseOptions,
  isExpenseCategoryType,
} from "../../components/dropdown/DropdownOption";
import {
  isSortType,
  useRemoveExpense,
  useUpdateExpense,
} from "../../hooks/useExpenses/useExpenses";
import { Dropdown } from "../../components/dropdown/Dropdown";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { SearchBar } from "../../components/searchBar/SearchBar";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { formatAllPdfsExpenses } from "./utils";
import type { AllExpensePdfTypes } from "./types";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { DocumentSkeletonLoader } from "../../components/skeletonLoader/DocumentSkeletonLoader";
import { Button } from "../../components/button/Button";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useBanner } from "../../context/banner/BannerContext";
import { useFetchExpenses } from "../../hooks/useExpenses/useExpenses";
import { useModal } from "../../context/modal/ModalContext";
import {
  generateExpenseCsv,
  downloadCsv,
  buildCsvFileName,
} from "../../utils/csvExport";
import { ExpenseEditForm } from "../../components/modal/ExpenseEditForm";
import { BulkDeleteConfirmationForm } from "../../components/modal/BulkDeleteConfirmationForm";
import { BulkActionBar } from "../../components/bulkActionBar/BulkActionBar";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import { useBulkSelectContext } from "../../context/BulkSelectContext";
import type { StoredProduct } from "../../hooks/useExpenses/types";

export const AllExpensesPdfsPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const { showBanner } = useBanner();

  const { setTitle } = useTitle();

  useLayoutEffect(() => {
    setTitle("Alle Dokumente");
  }, [setTitle]);

  const [contentCardData, setContentCardData] = useState<
    AllExpensePdfTypes | undefined
  >();

  const [searchQuery, setSearchQuery] = useState("");

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

  const [categorySelected, setCategorySelected] = useState<
    DropdownOptions["expenseCategory"][number]
  >(categoryExpenseOptions[0]);

  const bulk = useBulkSelect();

  const { registerExit, unregisterExit } = useBulkSelectContext();
  useEffect(() => {
    registerExit(bulk.exitSelectionMode);
    return () => unregisterExit();
  }, [bulk.exitSelectionMode, registerExit, unregisterExit]);

  const handleResetFilters = useCallback(() => {
    setSortSelected(paycheckFilterOptions[0]);
    setStartMonthSelected(monthOptions[0]);
    setEndMonthSelected(monthOptions[monthOptions.length - 1]);
    setCategorySelected(categoryExpenseOptions[0]);
    setSearchQuery("");
    bulk.exitSelectionMode();
  }, [bulk]);

  const pathname = usePathname();
  const param = pathname.split("/")[1];

  const { openModal, closeModal } = useModal();
  const removeFile = useRemoveExpense();
  const updateExpense = useUpdateExpense();

  const { data, isLoading, error } = useFetchExpenses({
    userId: user?.id ?? "",
    year,
    startMonth: Number(startMonthSelected.id) || undefined,
    endMonth: Number(endMonthSelected.id) || undefined,
    sortBy: isSortType(sortSelected.id) ? sortSelected.id : "new",
    category: isExpenseCategoryType(categorySelected.id)
      ? categorySelected.id
      : "all",
  });

  useEffect(() => {
    if (data) {
      setContentCardData(formatAllPdfsExpenses(data));
    }
  }, [data]);

  useEffect(() => {
    handleResetFilters();
  }, [year]);

  useEffect(() => {
    if (
      monthOptions.indexOf(endMonthSelected) <
      monthOptions.indexOf(startMonthSelected)
    ) {
      setEndMonthSelected(startMonthSelected);
    }
  }, [startMonthSelected]);

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

  if (!user) return <ErrorBlock />;

  const filteredPdfs = useMemo(() => {
    if (!contentCardData) return [];

    return contentCardData.pdfs.filter((pdf) => {
      if (searchQuery.trim() === "") return true;
      return pdf.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [contentCardData, searchQuery]);

  const isFiltered = useMemo(() => {
    if (categorySelected.id !== "all") return true;
    if (startMonthSelected.id !== "1") return true;
    if (endMonthSelected.id !== "12") return true;
    if (searchQuery.trim() !== "") return true;
    return false;
  }, [categorySelected, startMonthSelected, endMonthSelected, searchQuery]);

  const handleBulkDelete = useCallback(() => {
    if (bulk.count === 0) return;
    openModal({
      title: "Dokumente löschen",
      children: (
        <BulkDeleteConfirmationForm
          count={bulk.count}
          onConfirm={async () => {
            const ids = Array.from(bulk.selectedIds);
            const toDelete = filteredPdfs.filter((pdf) => ids.includes(pdf.id));
            await Promise.all(
              toDelete.map((pdf) =>
                removeFile.mutateAsync({ id: pdf.id, imageUrl: pdf.image_url }),
              ),
            );
            bulk.exitSelectionMode();
            closeModal();
          }}
          onCancel={closeModal}
        />
      ),
    });
  }, [bulk, filteredPdfs, openModal, closeModal, removeFile]);

  const handleBulkDownload = useCallback(async () => {
    const selected = filteredPdfs.filter((pdf) => bulk.selectedIds.has(pdf.id));
    if (selected.length === 0) return;

    const zip = new JSZip();
    try {
      await Promise.all(
        selected.map(async (pdf, index) => {
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
      link.download = `auswahl_${selected.length}_dokumente.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showBanner(
        "Download gestartet",
        `${selected.length} Dokument${selected.length > 1 ? "e" : ""} werden als ZIP heruntergeladen.`,
        "success",
      );
    } catch {
      showBanner(
        "Download fehlgeschlagen",
        "Beim Herunterladen ist ein Fehler aufgetreten.",
        "error",
      );
    }
  }, [bulk.selectedIds, filteredPdfs, showBanner]);

  if (!contentCardData) return <PageSkeletonLoader />;

  if (error) return <ErrorBlock />;

  const handleExportCsv = () => {
    if (filteredPdfs.length === 0) {
      showBanner(
        "Keine Daten zum Exportieren",
        "Es sind keine Daten zum CSV-Export verfügbar.",
        "error",
      );
      return;
    }

    const csvContent = generateExpenseCsv(filteredPdfs);
    const csvName = buildCsvFileName([
      user.email ? user.email.split("@")[0] : null,
      "steuerrelevante-ausgaben",
      startMonthSelected.label,
      endMonthSelected.id !== startMonthSelected.id
        ? `to_${endMonthSelected.label}`
        : null,
      `${year}`,
      categorySelected.id,
      searchQuery ? `search_${searchQuery}` : null,
    ]);

    downloadCsv(csvContent, csvName);
    showBanner(
      "CSV-Export gestartet",
      "Deine Daten werden als CSV-Datei heruntergeladen.",
      "success",
    );
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();

    if (filteredPdfs.length === 0) {
      showBanner(
        "Keine PDFs zum Herunterladen",
        "Es sind keine gefilterten PDFs zum Download verfügbar.",
        "error",
      );
      return;
    }

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
      categorySelected.id,
      searchQuery ? `search_${searchQuery}` : null,
    ]
      .filter((v): v is string => Boolean(v))
      .map(slugify)
      .join("_")
      .concat("_documents.zip");

    try {
      await Promise.all(
        filteredPdfs.map(async (pdf, index) => {
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
    }
  };

  return (
    <main className="flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-10 pb-25">
      <TotalIncomeCard
        title={param === "einnahmen" ? "Gesamteinnahmen" : "Gesamtkosten"}
        subtitle={contentCardData.totalPdf + " · Dokumente"}
        totalIncome={contentCardData.totalIncome}
        variant={param === "einnahmen" ? "income" : "expense"}
      />
      <div className="flex flex-col gap-2">
        <div className="grid md:grid-cols-2 gap-2">
          <Dropdown
            label="Sortieren nach"
            options={paycheckFilterOptions}
            onSelect={(v) => {
              bulk.exitSelectionMode();
              setSortSelected(v);
            }}
            value={sortSelected}
          />
          <Dropdown
            label="Kategorie auswählen"
            options={categoryExpenseOptions}
            onSelect={(v) => {
              bulk.exitSelectionMode();
              setCategorySelected(v);
            }}
            value={categorySelected}
          />
          <Dropdown
            label="Startmonat auswählen"
            options={monthOptions}
            onSelect={(v) => {
              bulk.exitSelectionMode();
              setStartMonthSelected(v);
            }}
            value={startMonthSelected}
          />
          <Dropdown
            label="Endmonat auswählen"
            options={endMonthOptions}
            onSelect={(v) => {
              bulk.exitSelectionMode();
              setEndMonthSelected(v);
            }}
            value={endMonthSelected}
          />
        </div>
        <div className="grid grid-cols-1">
          <SearchBar
            placeholder="Dokumente suchen..."
            onChange={(v) => {
              bulk.exitSelectionMode();
              setSearchQuery(v);
            }}
            value={searchQuery}
            debounceMs={200}
            title="Dokumente suchen"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 items-center gap-3">
        <Button
          onClick={handleResetFilters}
          text="Filter zurücksetzen"
          size="medium"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            onClick={() => {
              bulk.exitSelectionMode();
              handleDownloadAll();
            }}
            variant="secondary"
            text={
              isFiltered
                ? "Gefilterte Dokumente herunterladen"
                : "Alle Dokumente herunterladen"
            }
            size="medium"
          />
          <Button
            onClick={() => {
              bulk.exitSelectionMode();
              handleExportCsv();
            }}
            variant="secondary"
            text={
              isFiltered
                ? "Gefilterte Daten als CSV exportieren"
                : "Alle Daten als CSV exportieren"
            }
            size="medium"
          />
          <Button
            onClick={
              bulk.isSelecting
                ? bulk.exitSelectionMode
                : bulk.enterSelectionMode
            }
            variant="secondary"
            text={bulk.isSelecting ? "Auswahl beenden" : "Auswählen"}
            size="medium"
          />
        </div>
      </div>
      {isLoading ? (
        <DocumentSkeletonLoader />
      ) : (
        <div className="flex flex-col gap-6">
          {filteredPdfs.length === 0 ? (
            <EmptyState
              message="Keine Dokumente gefunden"
              hint="Versuche andere Filter oder lade ein neues Dokument hoch."
            />
          ) : (
            filteredPdfs.map((pdf, index) => (
              <ContentCard
                key={pdf.id || index}
                variant="document"
                title={pdf.file_name}
                date={pdf.expense_date}
                profit={pdf.amount}
                downloadLink={pdf.signed_url}
                openLink={pdf.signed_url}
                searchQuery={searchQuery}
                id={pdf.id}
                onDelete={(id) =>
                  removeFile.mutate({ id, imageUrl: pdf.image_url })
                }
                onEdit={handleEditExpense}
                products={pdf.products}
                vendorName={pdf.vendor_name}
                isSelecting={bulk.isSelecting}
                isSelected={bulk.isSelected(pdf.id)}
                onToggleSelect={bulk.toggle}
              />
            ))
          )}
        </div>
      )}

      {bulk.isSelecting && bulk.count > 0 && (
        <BulkActionBar
          count={bulk.count}
          totalCount={filteredPdfs.length}
          onSelectAll={() => bulk.selectAll(filteredPdfs.map((p) => p.id))}
          onDeselectAll={bulk.deselectAll}
          onDelete={handleBulkDelete}
          onDownload={handleBulkDownload}
          onCancel={bulk.exitSelectionMode}
        />
      )}
    </main>
  );
};
