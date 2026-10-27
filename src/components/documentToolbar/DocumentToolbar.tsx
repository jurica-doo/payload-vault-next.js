import type { ReactNode } from "react";
import { SearchBar } from "../searchBar/SearchBar";
import { ActionMenu } from "../actionMenu/ActionMenu";
import {
  ChecklistIcon,
  ChevronDownIcon,
  DownloadIcon,
  ExportIcon,
  FileTextIcon,
  XIcon,
} from "../icons";

type DocumentToolbarProps = {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  /** Filter controls (Dropdowns); laid out in a responsive grid. */
  filters?: ReactNode;
  isFiltered: boolean;
  onReset: () => void;
  onDownloadAll?: () => void;
  onExportCsv?: () => void;
  selection?: { isSelecting: boolean; onToggle: () => void };
  /** Shown as "N Dokumente" next to the reset action. */
  resultCount?: number;
};

/**
 * Filter + action bar for every document list. One row of controls; export
 * actions live in a single "Exportieren" menu, and "Filter zurücksetzen"
 * only appears while a filter is active — so the list stays the focus.
 */
export const DocumentToolbar = ({
  search,
  filters,
  isFiltered,
  onReset,
  onDownloadAll,
  onExportCsv,
  selection,
  resultCount,
}: DocumentToolbarProps) => {
  const scope = isFiltered ? "Gefilterte" : "Alle";
  return (
    <div className="ui-card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {search && (
          <div className="min-w-0 flex-1">
            <SearchBar
              placeholder={search.placeholder ?? "Dokumente suchen …"}
              value={search.value}
              onChange={search.onChange}
              debounceMs={200}
            />
          </div>
        )}
        <div className={`flex items-center gap-2 ${search ? "" : "sm:ml-auto"}`}>
          {selection && (
            <button
              type="button"
              onClick={selection.onToggle}
              aria-pressed={selection.isSelecting}
              className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-radius-md border px-3.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
                selection.isSelecting
                  ? "border-color-primary bg-color-bg-accent-subtle text-color-text-accent"
                  : "border-color-border-strong bg-color-bg-card text-color-text-main hover:bg-color-bg-hover"
              }`}
            >
              <ChecklistIcon size={16} />
              {selection.isSelecting ? "Auswahl beenden" : "Auswählen"}
            </button>
          )}
          {(onDownloadAll || onExportCsv) && (
            <ActionMenu
              label="Exportieren"
              trigger={
                <span className="inline-flex h-10 items-center gap-2 rounded-radius-md border border-color-border-strong bg-color-bg-card px-3.5 text-sm font-medium text-color-text-main">
                  <ExportIcon size={16} />
                  Exportieren
                  <ChevronDownIcon size={14} className="text-color-text-subtle" />
                </span>
              }
              items={[
                {
                  label: `${scope} Dokumente als ZIP`,
                  icon: DownloadIcon,
                  onClick: () => onDownloadAll?.(),
                  hidden: !onDownloadAll,
                },
                {
                  label: `${scope} Daten als CSV`,
                  icon: FileTextIcon,
                  onClick: () => onExportCsv?.(),
                  hidden: !onExportCsv,
                },
              ]}
            />
          )}
        </div>
      </div>

      {filters && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 [&>*:only-child]:col-span-2">
          {filters}
        </div>
      )}

      {(isFiltered || resultCount !== undefined) && (
        <div className="flex min-h-7 items-center justify-between gap-3 text-[0.8125rem] text-color-text-subtle">
          <span className="tabular">
            {resultCount !== undefined &&
              `${resultCount} ${resultCount === 1 ? "Dokument" : "Dokumente"}${isFiltered ? " (gefiltert)" : ""}`}
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={onReset}
              className="ui-link-button animate-fade-in"
            >
              <XIcon size={14} />
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
};
