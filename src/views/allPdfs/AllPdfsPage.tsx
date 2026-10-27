"use client";

import { DocumentToolbar } from "../../components/documentToolbar/DocumentToolbar";
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
  categoryOptions,
  isSortType,
  isCategoryType,
} from "../../components/dropdown/DropdownOption";
import { Dropdown } from "../../components/dropdown/Dropdown";
import { ContentCard } from "../../components/contentCard/ContentCard";
import { TotalIncomeCard } from "../../components/totalIncomeCard/TotalIncomeCard";
import { usePdfs } from "../../hooks/usePdf/UsePdfs";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { formatAllPdfs } from "./utils";
import { PageSkeletonLoader } from "../../components/skeletonLoader/PageSkeletonLoader";
import { DocumentSkeletonLoader } from "../../components/skeletonLoader/DocumentSkeletonLoader";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import {
  generateIncomeCsv,
  downloadCsv,
  buildCsvFileName,
} from "../../utils/csvExport";
import { PdfEditForm } from "../../components/modal/PdfEditForm";
import { BulkDeleteConfirmationForm } from "../../components/modal/BulkDeleteConfirmationForm";
import { BulkActionBar } from "../../components/bulkActionBar/BulkActionBar";
import { useBulkSelect } from "../../hooks/useBulkSelect";
import { useBulkSelectContext } from "../../context/BulkSelectContext";
import type { PdfCategory } from "../../hooks/usePdf/usePendingUpload";

export const AllPdfsPage = () => {
  const { user } = useAuth();
  const { year } = useYear();

  const { showBanner } = useBanner();

  const { setTitle } = useTitle();

  useLayoutEffect(() => {
    setTitle("Alle Dokumente");
  }, [setTitle]);

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
    DropdownOptions["category"][number]
  >(categoryOptions[0]);

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
    setCategorySelected(categoryOptions[0]);
    setSearchQuery("");
    bulk.exitSelectionMode();
  }, [bulk]);

  const pathname = usePathname();
  const param = pathname.split("/")[1];

  const { openModal, closeModal } = useModal();

  const {
    data: pdfs,
    isLoading,
    error,
    removePdf,
    updatePdf,
  } = usePdfs({
    userId: user?.id ?? "",
    year,
    startMonth: Number(startMonthSelected.id) || undefined,
    endMonth: Number(endMonthSelected.id) || undefined,
    sortBy: isSortType(sortSelected.id) ? sortSelected.id : "new",
    category: isCategoryType(categorySelected.id) ? categorySelected.id : "all",
  });

  // Derived directly from the query result — no state+effect, so switching
  // the year or filters can never briefly show the previous result set.
  const contentCardData = useMemo(
    () => (pdfs ? formatAllPdfs(pdfs) : undefined),
    [pdfs],
  );

  // Reset all filters when the (header-owned) year changes. The event source
  // lives outside this component, so an effect is the only hook point.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleResetFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const handleEditPdf = useCallback(
    (id: string) => {
      const pdf = pdfs?.find((p) => p.id === id);
      if (!pdf) return;

      openModal({
        title: "Dokument bearbeiten",
        children: (
          <PdfEditForm
            pdfId={pdf.id}
            fileName={pdf.file_name}
            category={pdf.category as PdfCategory}
            profit={pdf.profit}
            dateCreated={pdf.date_created}
            onSave={async (payload) => {
              await updatePdf.mutateAsync(payload);
            }}
            onCancel={closeModal}
          />
        ),
      });
    },
    [pdfs, openModal, closeModal, updatePdf],
  );

  const filteredPdfs = useMemo(() => {
    if (!contentCardData) return [];

    return contentCardData.pdfs.filter((pdf) => {
      if (searchQuery.trim() === "") return true;
      return pdf.title.toLowerCase().includes(searchQuery.toLowerCase());
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
            await Promise.all(ids.map((id) => removePdf.mutateAsync(id)));
            bulk.exitSelectionMode();
            closeModal();
          }}
          onCancel={closeModal}
        />
      ),
    });
  }, [bulk, openModal, closeModal, removePdf]);

  const handleBulkDownload = useCallback(async () => {
    const selected = filteredPdfs.filter((pdf) => bulk.selectedIds.has(pdf.id));
    if (selected.length === 0) return;

    const zip = new JSZip();
    try {
      await Promise.all(
        selected.map(async (pdf, index) => {
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

  if (!user) return <ErrorBlock />;

  if (error) return <ErrorBlock />;

  if (!contentCardData) return <PageSkeletonLoader />;

  const handleExportCsv = () => {
    if (!pdfs || filteredPdfs.length === 0) {
      showBanner(
        "Keine Daten zum Exportieren",
        "Es sind keine Daten zum CSV-Export verfügbar.",
        "error",
      );
      return;
    }

    const filteredTitles = new Set(filteredPdfs.map((p) => p.title));
    const matchingPdfs = pdfs.filter((p) => filteredTitles.has(p.file_name));

    const csvContent = generateIncomeCsv(matchingPdfs);
    const csvName = buildCsvFileName([
      user.email ? user.email.split("@")[0] : null,
      "einnahmen",
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
      "Ihre Daten werden als CSV-Datei heruntergeladen.",
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
      "einnahmen",
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
        "Ihre PDFs werden als ZIP-Datei heruntergeladen.",
        "success",
      );
    } catch {
      showBanner(
        "PDF-Download fehlgeschlagen",
        "Beim Herunterladen der PDFs ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
        "error",
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <TotalIncomeCard
        title={param === "einnahmen" ? "Gesamteinnahmen" : "Gesamtkosten"}
        subtitle={contentCardData.totalPdf + " Dokumente"}
        totalIncome={contentCardData.totalIncome}
        variant={param === "einnahmen" ? "income" : "expense"}
      />
      <DocumentToolbar
        search={{
          value: searchQuery,
          onChange: (v) => {
            bulk.exitSelectionMode();
            setSearchQuery(v);
          },
        }}
        isFiltered={isFiltered}
        onReset={handleResetFilters}
        onDownloadAll={() => {
          bulk.exitSelectionMode();
          handleDownloadAll();
        }}
        onExportCsv={() => {
          bulk.exitSelectionMode();
          handleExportCsv();
        }}
        selection={{
          isSelecting: bulk.isSelecting,
          onToggle: bulk.isSelecting ? bulk.exitSelectionMode : bulk.enterSelectionMode,
        }}
        resultCount={filteredPdfs.length}
        filters={
          <>
            <Dropdown
              label="Sortierung"
              options={paycheckFilterOptions}
              onSelect={(v) => {
                bulk.exitSelectionMode();
                setSortSelected(v);
              }}
              value={sortSelected}
            />
            <Dropdown
              label="Kategorie"
              options={categoryOptions}
              onSelect={(v) => {
                bulk.exitSelectionMode();
                setCategorySelected(v);
              }}
              value={categorySelected}
            />
            <Dropdown
              label="Von"
              options={monthOptions}
              onSelect={(v) => {
                bulk.exitSelectionMode();
                setStartMonthSelected(v);
                // Keep the range valid: end month can never precede start month.
                if (
                  monthOptions.indexOf(endMonthSelected) < monthOptions.indexOf(v)
                ) {
                  setEndMonthSelected(v);
                }
              }}
              value={startMonthSelected}
            />
            <Dropdown
              label="Bis"
              options={endMonthOptions}
              onSelect={(v) => {
                bulk.exitSelectionMode();
                setEndMonthSelected(v);
              }}
              value={endMonthSelected}
            />
          </>
        }
      />
      {isLoading ? (
        <DocumentSkeletonLoader />
      ) : (
        <div className="flex flex-col gap-2.5 stagger">
          {filteredPdfs.length === 0 ? (
            <EmptyState
              message="Keine Dokumente gefunden"
              hint="Passen Sie die Filter an oder laden Sie ein neues Dokument hoch."
            />
          ) : (
            filteredPdfs.map((pdf, index) => (
              <ContentCard
                key={pdf.id || index}
                variant="document"
                title={pdf.title}
                date={pdf.date}
                profit={pdf.income}
                downloadLink={pdf.signedUrl}
                openLink={pdf.openLink}
                searchQuery={searchQuery}
                id={pdf.id}
                onDelete={(id) => removePdf.mutate(id)}
                onEdit={handleEditPdf}
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
    </div>
  );
};
