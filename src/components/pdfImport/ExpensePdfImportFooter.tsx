import { errorText } from "../../utils/dbErrors";
import { useAuth } from "../../context/AuthContext";
import { useExpenseConfirmUploadModal } from "../../hooks/modal/UseExpenseConfirmUploadModal";
import {
  useUploadAndExtract,
  useConfirmAndUploadToDatabase,
  useDeclineExpenseUpload,
  ExtractionExpenseError,
  checkDuplicateExpenseContent,
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
import { supabase } from "../../lib/supabase";

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
      reason: errorText(
        error,
        "Der Beleg konnte nicht verarbeitet werden. Bitte prüfen Sie die Datei und versuchen Sie es erneut.",
      ),
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
        "Belege verworfen",
        declined === 1
          ? "Der Beleg wurde nicht gespeichert."
          : `${declined} Belege wurden nicht gespeichert.`,
        "info",
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
        `„${truncateName(payload.file_name)}“ nicht gespeichert`,
        errorText(error, "Der Beleg konnte nicht gespeichert werden. Bitte laden Sie ihn erneut hoch."),
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

        // Check for content-based duplicates after extraction
        if (pendingUploads.length > 0 && user?.id) {
          await Promise.all(
            pendingUploads.map(async (upload) => {
              try {
                const totalAmount = upload.products.reduce(
                  (sum, p) => sum + p.amount,
                  0,
                );
                const match = await checkDuplicateExpenseContent(user.id, {
                  expense_date: upload.expense_date,
                  vendor_name: upload.vendor_name,
                  amount: totalAmount,
                });
                if (match) {
                  upload.isDuplicate = true;
                  const { data: signedData } = await supabase.storage
                    .from("expense_invoices")
                    .createSignedUrl(match.image_url, 900);
                  upload.duplicateMatch = {
                    file_name: match.file_name,
                    signed_url: signedData?.signedUrl ?? "",
                  };
                }
              } catch {
                // If check fails, don't block — treat as non-duplicate
                upload.isDuplicate = false;
              }
            }),
          );
        }

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
            ? "Beleg nicht erkannt"
            : "Upload fehlgeschlagen";

          // One file: say exactly why. Several: count plus the first reason.
          const description =
            failedFiles.length === 1
              ? `${truncateName(failedFiles[0].name)}: ${failedFiles[0].reason}`
              : `${failedFiles.length} Dateien konnten nicht verarbeitet werden – z. B. ${truncateName(failedFiles[0].name)}: ${failedFiles[0].reason}`;

          showBanner(title, description, "error");
        }
      },
    });

  if (!user) return null;

  // Primary action of the vault pages. Sits in the top bar on desktop and
  // floats bottom-right on smaller screens (thumb reach).
  return (
    <div className="max-lg:fixed max-lg:right-4 max-lg:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] max-lg:z-40">
      <Button
        onClick={() => {
          exitSelectionMode();
          openExpenseImportPdfModal();
        }}
        icon={UploadIcon}
        text="Dokument hochladen"
        className="max-lg:h-12 max-lg:rounded-full max-lg:px-5 max-lg:shadow-shadow-strong"
      />
    </div>
  );
};
