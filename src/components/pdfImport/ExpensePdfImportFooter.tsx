import { useAuth } from "../../context/AuthContext";
import { useExpenseConfirmUploadModal } from "../../hooks/modal/UseExpenseConfirmUploadModal";
import {
  useUploadAndExtract,
  useConfirmAndUploadToDatabase,
  useDeclineExpenseUpload,
  ExtractionExpenseError,
} from "../../hooks/useExpenses/useExpenses";
import type {
  PendingExpenseUpload,
  ConfirmReceiptPayload,
} from "../../hooks/useExpenses/types";
import { Button } from "../button/Button";
import { UploadIcon } from "../icons";
import { useBanner } from "../../context/banner/BannerContext";
import type { UploadProgress } from "../modal/ExpenseImportPdfForm";
import { useRef } from "react";
import { useExpenseImportPdfModal } from "../../hooks/modal/UseExpenseImportPdfModal";
import { useBulkSelectContext } from "../../context/BulkSelectContext";

const truncateName = (name: string, max = 30) =>
  name.length > max ? name.slice(0, max) + "..." : name;

export const ExpensePdfImportFooter = () => {
  const { user } = useAuth();
  const uploadAndExtract = useUploadAndExtract(user?.id || "");
  const confirmExpense = useConfirmAndUploadToDatabase();
  const declineExpense = useDeclineExpenseUpload();
  const { showBanner } = useBanner();
  const { exitSelectionMode } = useBulkSelectContext();

  const classifyImportError = (
    error: unknown,
  ): {
    reason: string;
    errorType: "extraction" | "unknown";
  } => {
    if (error instanceof ExtractionExpenseError) {
      return {
        reason:
          error.rejectionReason ||
          "Dieses Dokument konnte nicht verarbeitet werden.",
        errorType: "extraction",
      };
    }

    return {
      reason: "Import fehlgeschlagen. Bitte Datei prüfen und erneut versuchen.",
      errorType: "unknown",
    };
  };

  const statsRef = useRef({ confirmed: 0, declined: 0 });

  const showFinalBanner = () => {
    const { confirmed, declined } = statsRef.current;

    if (confirmed > 0 && declined === 0) {
      showBanner(
        "Upload abgeschlossen",
        confirmed === 1
          ? "1 Beleg wurde erfolgreich gespeichert."
          : `${confirmed} Belege wurden erfolgreich gespeichert.`,
        "success",
      );
    } else if (confirmed === 0 && declined > 0) {
      showBanner(
        "Alle abgelehnt",
        declined === 1
          ? "1 Beleg wurde abgelehnt."
          : `${declined} Belege wurden abgelehnt.`,
        "error",
      );
    } else if (confirmed > 0 && declined > 0) {
      showBanner(
        "Upload teilweise abgeschlossen",
        `${confirmed} bestätigt, ${declined} abgelehnt.`,
        "success",
      );
    }

    statsRef.current = { confirmed: 0, declined: 0 };
  };

  const handleConfirmReceipt = async (payload: ConfirmReceiptPayload) => {
    try {
      await confirmExpense.mutateAsync({
        user_id: user?.id || "",
        ...payload,
      });
      statsRef.current.confirmed++;
    } catch (error) {
      console.error("Error confirming receipt:", error);
      showBanner(
        "Fehler",
        `Bestätigung fehlgeschlagen: ${truncateName(payload.file_name)}`,
        "error",
      );
    }
  };

  const handleDeclineReceipt = async (filePath: string) => {
    try {
      await declineExpense.mutateAsync(filePath);
      statsRef.current.declined++;
    } catch (error) {
      console.error("Error cleaning up receipt:", error);
    }
  };

  const { openExpenseConfirmUploadModal } = useExpenseConfirmUploadModal({
    onConfirmReceipt: handleConfirmReceipt,
    onDeclineReceipt: handleDeclineReceipt,
    onComplete: showFinalBanner,
  });

  const { openExpenseImportPdfModal, closeModal: closeImportModal } =
    useExpenseImportPdfModal({
      onSave: async (
        files: File[],
        onProgress: (progress: UploadProgress) => void,
      ) => {
        if (!files || files.length === 0) {
          console.warn("No files selected");
          return;
        }

        const pendingUploads: PendingExpenseUpload[] = [];
        let completedCount = 0;
        const failedFiles: {
          name: string;
          reason?: string;
          errorType: "extraction" | "unknown";
        }[] = [];

        onProgress({
          completed: 0,
          total: files.length,
          inProgress: true,
        });

        const extractionPromises = files.map(async (file) => {
          try {
            const pendingUpload = await uploadAndExtract.mutateAsync(file);
            pendingUploads.push(pendingUpload);
          } catch (error) {
            console.error(`Error extracting file ${file.name}:`, error);
            const classifiedError = classifyImportError(error);
            failedFiles.push({
              name: file.name,
              reason: classifiedError.reason,
              errorType: classifiedError.errorType,
            });
          } finally {
            completedCount++;
            onProgress({
              completed: completedCount,
              total: files.length,
              inProgress: completedCount < files.length,
            });
          }
        });

        await Promise.all(extractionPromises);

        closeImportModal();

        if (pendingUploads.length > 0) {
          setTimeout(() => {
            openExpenseConfirmUploadModal(pendingUploads);
          }, 100);
        }

        if (failedFiles.length > 0) {
          const allExtraction = failedFiles.every(
            (f) => f.errorType === "extraction",
          );

          const title = allExtraction
            ? "Extraktion fehlgeschlagen"
            : "Import fehlgeschlagen";

          const description = `${failedFiles.length} Datei${failedFiles.length > 1 ? "en" : ""} konnten nicht verarbeitet werden.`;

          showBanner(title, description, "error");
        }
      },
    });

  if (!user) return null;

  return (
    <div
      className="
      fixed
      bottom-0
      left-0
      w-full
      p-4
      border-t
      border-color-border-light
      flex
      justify-center
      items-center
      bg-color-bg-main
      z-50
      shadow-[0_-4px_12px_rgba(0,0,0,0.1)]
    "
    >
      <Button
        onClick={() => {
          exitSelectionMode();
          openExpenseImportPdfModal();
        }}
        icon={UploadIcon}
        text="Dokument hochladen"
      />
    </div>
  );
};
