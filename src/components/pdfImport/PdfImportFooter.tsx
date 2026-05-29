import { useAuth } from "../../context/AuthContext";
import { useImportPdfModal } from "../../hooks/modal/UseImportPdfModal";
import { useConfirmUploadModal } from "../../hooks/modal/UseConfirmUploadModal";
import {
  usePdfs,
  ExtractionError,
  DuplicateFileError,
} from "../../hooks/usePdf/UsePdfs";
import { Button } from "../button/Button";
import { UploadIcon } from "../icons";
import { useBanner } from "../../context/banner/BannerContext";
import type { UploadProgress } from "../modal/ImportPdfForm";
import type { PendingUpload } from "../../hooks/usePdf/usePendingUpload";
import { useRef } from "react";
import { useBulkSelectContext } from "../../context/BulkSelectContext";

const truncateName = (name: string, max = 30) =>
  name.length > max ? name.slice(0, max) + "..." : name;

export const PdfImportFooter = () => {
  const { user } = useAuth();
  const { extractPdf, confirmPdf, declinePdf } = usePdfs({
    userId: user?.id || "",
  });
  const { showBanner } = useBanner();
  const { exitSelectionMode } = useBulkSelectContext();

  const classifyImportError = (
    error: unknown,
  ): {
    reason: string;
    errorType: "duplicate" | "extraction" | "unknown";
  } => {
    if (error instanceof DuplicateFileError) {
      return {
        reason: "Eine Datei mit diesem Namen existiert bereits.",
        errorType: "duplicate",
      };
    }

    if (error instanceof ExtractionError) {
      return {
        reason:
          error.rejectionReason ||
          "Dieses Dokument konnte nicht verarbeitet werden.",
        errorType: "extraction",
      };
    }

    const message =
      error instanceof Error
        ? error.message.toLowerCase()
        : typeof error === "string"
          ? error.toLowerCase()
          : "";

    if (
      message.includes("duplicate") ||
      message.includes("already exists") ||
      message.includes("existiert bereits") ||
      message.includes("bereits vorhanden") ||
      message.includes("23505")
    ) {
      return {
        reason: "Eine Datei mit diesem Namen existiert bereits.",
        errorType: "duplicate",
      };
    }

    return {
      reason: "Import fehlgeschlagen. Bitte Datei prüfen und erneut versuchen.",
      errorType: "unknown",
    };
  };

  // Track stats for final banner
  const statsRef = useRef({ confirmed: 0, declined: 0 });

  const showFinalBanner = () => {
    const { confirmed, declined } = statsRef.current;

    if (confirmed > 0 && declined === 0) {
      showBanner(
        "Upload abgeschlossen",
        confirmed === 1
          ? "Die PDF-Datei wurde erfolgreich hochgeladen."
          : `Alle ${confirmed} Dateien wurden erfolgreich hochgeladen.`,
        "success",
      );
    } else if (confirmed === 0 && declined > 0) {
      showBanner(
        "Uploads abgelehnt",
        declined === 1
          ? "Die PDF-Datei wurde abgelehnt."
          : `${declined} Dateien wurden abgelehnt.`,
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

  const handleConfirmUpload = async (upload: PendingUpload) => {
    try {
      await confirmPdf.mutateAsync({
        userId: user?.id || "",
        pendingUpload: upload,
      });
      statsRef.current.confirmed++;
    } catch (error) {
      console.error("Error confirming upload:", error);
      showBanner(
        "Fehler",
        `Bestätigung fehlgeschlagen: ${truncateName(upload.fileName)}`,
        "error",
      );
    }
  };

  const handleDeclineUpload = async (upload: PendingUpload) => {
    try {
      await declinePdf.mutateAsync(upload.filePath);
      statsRef.current.declined++;
    } catch (error) {
      console.error("Error declining upload:", error);
    }
  };

  const { openConfirmUploadModal } = useConfirmUploadModal({
    onConfirm: handleConfirmUpload,
    onDecline: handleDeclineUpload,
    onComplete: showFinalBanner,
  });

  const { openImportPdfModal, closeModal: closeImportModal } =
    useImportPdfModal({
      onSave: async (
        files: File[],
        onProgress: (progress: UploadProgress) => void,
      ) => {
        if (!files || files.length === 0) {
          console.warn("No files selected");
          return;
        }

        const pendingUploads: PendingUpload[] = [];
        let completedCount = 0;
        const failedFiles: {
          name: string;
          reason?: string;
          errorType: "duplicate" | "extraction" | "unknown";
        }[] = [];

        onProgress({
          completed: 0,
          total: files.length,
          inProgress: true,
        });

        // Process files in parallel
        const extractionPromises = files.map(async (file) => {
          try {
            const pendingUpload = await extractPdf.mutateAsync({
              file,
              userId: user?.id || "",
            });
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
            openConfirmUploadModal(pendingUploads);
          }, 100);
        }

        if (failedFiles.length > 0) {
          const allDuplicates = failedFiles.every(
            (f) => f.errorType === "duplicate",
          );
          const allExtraction = failedFiles.every(
            (f) => f.errorType === "extraction",
          );

          const title = allDuplicates
            ? "Duplikat erkannt"
            : allExtraction
              ? "Extraktion fehlgeschlagen"
              : "Import fehlgeschlagen";

          const description = allDuplicates
            ? failedFiles.length === 1
              ? `${truncateName(failedFiles[0].name)}: ${failedFiles[0].reason}`
              : `${failedFiles.length} Dateien existieren bereits.`
            : `${failedFiles.length} Datei${failedFiles.length > 1 ? "en" : ""} konnten nicht verarbeitet werden.`;

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
          openImportPdfModal();
        }}
        icon={UploadIcon}
        text="Dokument hochladen"
      />
    </div>
  );
};
