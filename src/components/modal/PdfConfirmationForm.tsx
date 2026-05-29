import { useState, useEffect, useRef } from "react";
import { Button } from "../button/Button";
import { Dropdown } from "../dropdown/Dropdown";
import { InputField } from "../inputField/InputField";
import type {
  PendingUpload,
  PdfCategory,
} from "../../hooks/usePdf/usePendingUpload";
import type { Option } from "../dropdown/Dropdown.types";

const CATEGORY_OPTIONS: Option[] = [
  { id: "Strom & Gas", label: "Strom & Gas" },
  { id: "Barmenia Abrechnung", label: "Barmenia Abrechnung" },
  { id: "IKK Abrechnung", label: "IKK Abrechnung" },
  { id: "Adcuri Abschlussprovision", label: "Adcuri Abschlussprovision" },
  { id: "Adcuri Bestandsprovision", label: "Adcuri Bestandsprovision" },
];

interface PdfConfirmationFormProps {
  pendingUploads: PendingUpload[];
  onConfirm: (upload: PendingUpload) => Promise<void>;
  onDecline: (upload: PendingUpload) => Promise<void>;
  onConfirmAll: (uploads: PendingUpload[]) => Promise<void>;
  onDeclineAll: (uploads: PendingUpload[]) => Promise<void>;
  onClose: () => void;
}

type EditableData = {
  category: PdfCategory;
  profit: string;
  dateCreated: string;
};

export const PdfConfirmationForm = ({
  pendingUploads: initialUploads,
  onConfirm,
  onDecline,
  onConfirmAll,
  onDeclineAll,
  onClose,
}: PdfConfirmationFormProps) => {
  const [pendingUploads, setPendingUploads] =
    useState<PendingUpload[]>(initialUploads);
  const [editedData, setEditedData] = useState<Record<string, EditableData>>(
    () => {
      const initial: Record<string, EditableData> = {};
      initialUploads.forEach((upload) => {
        initial[upload.id] = {
          category: upload.extractedData.category,
          profit: String(upload.extractedData.profit),
          dateCreated: upload.extractedData.dateCreated,
        };
      });
      return initial;
    },
  );
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // Track pending uploads in ref for cleanup on unmount
  const pendingUploadsRef = useRef<PendingUpload[]>(pendingUploads);
  pendingUploadsRef.current = pendingUploads;

  // Guard against StrictMode double-mount: only allow cleanup after user interaction
  const userInteractedRef = useRef(false);

  const isSingleUpload = pendingUploads.length === 1;
  const hasUploads = pendingUploads.length > 0;

  const updateField = (
    id: string,
    field: keyof EditableData,
    value: string,
  ) => {
    setEditedData((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const getUploadWithEditedData = (upload: PendingUpload): PendingUpload => {
    const edited = editedData[upload.id];
    return {
      ...upload,
      extractedData: {
        ...upload.extractedData,
        category: edited.category,
        profit: parseFloat(edited.profit) || 0,
        dateCreated: edited.dateCreated,
      },
    };
  };

  const handleConfirm = async (upload: PendingUpload) => {
    userInteractedRef.current = true;
    setProcessingIds((prev) => new Set(prev).add(upload.id));
    try {
      await onConfirm(getUploadWithEditedData(upload));
      const remaining = pendingUploads.filter((u) => u.id !== upload.id);
      pendingUploadsRef.current = remaining;
      setPendingUploads(remaining);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(upload.id);
        return next;
      });
    }
  };

  const handleDecline = async (upload: PendingUpload) => {
    userInteractedRef.current = true;
    setProcessingIds((prev) => new Set(prev).add(upload.id));
    try {
      await onDecline(upload);
      setPendingUploads((prev) => prev.filter((u) => u.id !== upload.id));
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(upload.id);
        return next;
      });
    }
  };

  const handleConfirmAll = async () => {
    userInteractedRef.current = true;
    setIsProcessingAll(true);
    try {
      const uploadsWithEdits = pendingUploads.map(getUploadWithEditedData);
      await onConfirmAll(uploadsWithEdits);
      pendingUploadsRef.current = [];
      setPendingUploads([]);
    } finally {
      setIsProcessingAll(false);
    }
  };

  const handleDeclineAll = async () => {
    userInteractedRef.current = true;
    setIsProcessingAll(true);
    try {
      await onDeclineAll(pendingUploads);
      setPendingUploads([]);
    } finally {
      setIsProcessingAll(false);
    }
  };

  useEffect(() => {
    if (!hasUploads) {
      onClose();
    }
  }, [hasUploads, onClose]);

  // Cleanup: decline any remaining uploads when modal is closed by the user.
  // The userInteractedRef guard prevents React StrictMode's synthetic
  // unmount-remount cycle from deleting freshly uploaded files.
  useEffect(() => {
    return () => {
      if (!userInteractedRef.current) return;
      const remaining = pendingUploadsRef.current;
      if (remaining.length > 0) {
        onDeclineAll(remaining).catch(console.error);
      }
    };
  }, [onDeclineAll]);

  if (!hasUploads) {
    return null;
  }

  const getCategoryOption = (category: PdfCategory): Option | null => {
    return CATEGORY_OPTIONS.find((opt) => opt.id === category) || null;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Multiple uploads: bulk actions */}
      {!isSingleUpload && (
        <div className="flex flex-wrap items-center gap-3 border-b border-color-border-light pb-4">
          <Button
            variant="primary"
            text={`Alle ${pendingUploads.length} bestätigen`}
            onClick={handleConfirmAll}
            isDisabled={isProcessingAll}
          />
          <Button
            variant="secondary"
            text="Alle ablehnen"
            onClick={handleDeclineAll}
            isDisabled={isProcessingAll}
          />
        </div>
      )}

      {/* Upload items */}
      <div
        className={`flex flex-col gap-6 ${!isSingleUpload ? "max-h-[60vh] overflow-y-auto pr-2" : ""}`}
      >
        {pendingUploads.map((upload) => {
          const isProcessing = processingIds.has(upload.id) || isProcessingAll;
          const edited = editedData[upload.id];

          return (
            <div
              key={upload.id}
              className="flex flex-col gap-4 rounded-lg bg-color-bg-dark p-4"
            >
              {/* File name as title (only for multiple uploads) */}
              {!isSingleUpload && (
                <h3 className="font-semibold text-color-text-main truncate">
                  {upload.fileName}
                </h3>
              )}

              {/* Category dropdown */}
              <Dropdown
                label="Kategorie"
                options={CATEGORY_OPTIONS}
                value={getCategoryOption(edited.category)}
                onSelect={(opt) =>
                  updateField(upload.id, "category", opt.id as PdfCategory)
                }
                placeholder="Kategorie wählen"
              />

              {/* Profit input */}
              <InputField
                label="Gewinn (€)"
                type="number"
                placeholder="0.00"
                value={edited.profit}
                onChange={(val) => updateField(upload.id, "profit", val)}
              />

              {/* Date input */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`date-${upload.id}`}
                  className="flex h-6 items-center font-semibold text-color-text-secondary"
                >
                  <span className="ml-1 text-[14px]">Datum</span>
                </label>
                <input
                  id={`date-${upload.id}`}
                  type="date"
                  value={edited.dateCreated}
                  onChange={(e) =>
                    updateField(upload.id, "dateCreated", e.target.value)
                  }
                  className="w-full rounded-radius-md border border-color-border-light bg-color-bg-main px-4 py-3 text-color-text-main transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-color-bg-accent"
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => handleConfirm(upload)}
                  disabled={isProcessing}
                  className="rounded-md px-3 py-1.5 text-sm font-medium bg-color-success-border text-white hover:bg-color-success-border/80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 active:scale-95"
                >
                  ✓ Bestätigen
                </button>
                <button
                  onClick={() => handleDecline(upload)}
                  disabled={isProcessing}
                  className="rounded-md px-3 py-1.5 text-sm font-medium bg-color-error-border text-white hover:bg-color-error-border/80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 active:scale-95"
                >
                  ✕ Ablehnen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
