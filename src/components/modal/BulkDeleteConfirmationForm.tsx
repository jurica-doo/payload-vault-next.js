import { useState } from "react";
import { Button } from "../button/Button";
import { useBanner } from "../../context/banner/BannerContext";

interface BulkDeleteConfirmationFormProps {
  count: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const BulkDeleteConfirmationForm = ({
  count,
  onConfirm,
  onCancel,
}: BulkDeleteConfirmationFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { showBanner } = useBanner();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      showBanner(
        "Dokumente gelöscht",
        `${count} Dokument${count > 1 ? "e" : ""} erfolgreich gelöscht.`,
        "success",
      );
    } catch {
      showBanner(
        "Fehler",
        "Beim Löschen der Dokumente ist ein Fehler aufgetreten.",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-2">
      <p className="text-color-text-secondary w-full sm:w-70">
        Möchten Sie wirklich{" "}
        <span className="font-semibold text-color-text-primary">
          {count} Dokument{count > 1 ? "e" : ""}
        </span>{" "}
        unwiderruflich löschen?
      </p>
      <div className="mt-6 flex flex-wrap gap-3 sm:gap-6">
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button
          text={`${count} Dokument${count > 1 ? "e" : ""} löschen`}
          variant="decline"
          onClick={handleConfirm}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
