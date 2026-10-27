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
    <div
      role="region"
      aria-label="Auswahl"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] animate-slide-up lg:bottom-6 lg:pl-[16.5rem]"
    >
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-radius-xl bg-color-surface-raised py-2.5 pl-4 pr-2.5 shadow-shadow-strong ring-1 ring-color-border-light">
          {/* Left: count + select/deselect all */}
          <div className="flex items-center gap-3">
            <span className="tabular flex h-7 min-w-7 items-center justify-center rounded-full bg-color-primary px-2 text-xs font-semibold text-color-on-primary animate-pop-in" key={count}>
              {count}
            </span>
            <span className="text-sm font-medium text-color-text-main whitespace-nowrap">
              ausgewählt
            </span>
            <button
              type="button"
              className="ui-link-button"
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
                text-color-text-main border border-color-border-strong bg-color-bg-card
                hover:bg-color-bg-hover
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
                text-white bg-color-error
                hover:brightness-110
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
                hover:bg-color-bg-hover
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
