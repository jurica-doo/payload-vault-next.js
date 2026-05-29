import { DeleteIcon, DownloadIcon, CloseIcon } from "../icons";

interface BulkActionBarProps {
  count: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCancel: () => void;
}

export const BulkActionBar = ({
  count,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onDownload,
  onCancel,
}: BulkActionBarProps) => {
  const allSelected = count === totalCount && totalCount > 0;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-[60] animate-slide-up">
      <div className="mx-auto w-full max-w-5xl px-4 pb-2 sm:px-6 lg:px-8">
        <div
          className="flex flex-wrap items-center justify-between gap-3
            rounded-radius-md border border-color-border-light
            bg-color-bg-card px-4 py-3
            shadow-shadow-strong"
        >
          {/* Left: count + select/deselect all */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-color-text-main whitespace-nowrap">
              {count} ausgewählt
            </span>
            <button
              type="button"
              className="cursor-pointer text-sm font-medium text-color-primary
                hover:underline transition-colors duration-150"
              onClick={allSelected ? onDeselectAll : onSelectAll}
            >
              {allSelected ? "Alle abwählen" : "Alle auswählen"}
            </button>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-pointer flex items-center gap-2 rounded-radius-md
                px-3 py-2 text-sm font-medium
                text-color-text-main bg-color-bg-dark
                hover:bg-color-primary/10 hover:text-color-primary
                transition-all duration-200 active:scale-95"
              onClick={onDownload}
              disabled={count === 0}
            >
              <DownloadIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Herunterladen</span>
            </button>

            <button
              type="button"
              className="cursor-pointer flex items-center gap-2 rounded-radius-md
                px-3 py-2 text-sm font-medium
                text-color-error-text bg-color-error/10
                hover:bg-color-error/20
                transition-all duration-200 active:scale-95"
              onClick={onDelete}
              disabled={count === 0}
            >
              <DeleteIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Löschen</span>
            </button>

            <button
              type="button"
              className="cursor-pointer flex items-center justify-center
                rounded-radius-md p-2
                text-color-text-secondary hover:text-color-text-main
                hover:bg-color-bg-dark
                transition-all duration-200 active:scale-95"
              onClick={onCancel}
              aria-label="Auswahl beenden"
            >
              <CloseIcon className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
