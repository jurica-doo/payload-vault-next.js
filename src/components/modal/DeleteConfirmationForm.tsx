import { errorText } from "../../utils/dbErrors";
import { ModalActions } from "./ModalActions";
import { useState } from "react";
import { Button } from "../button/Button";
import { useBanner } from "../../context/banner/BannerContext";

interface DeleteConfirmationFormProps {
  fileName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const DeleteConfirmationForm = ({
  fileName,
  onConfirm,
  onCancel,
}: DeleteConfirmationFormProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const { showBanner } = useBanner();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();

      showBanner(
        "Datei gelöscht",
        `Die Datei wurde erfolgreich gelöscht: "${fileName}"`,
        "success",
      );
    } catch (err) {
      showBanner(
        "Löschen fehlgeschlagen",
        errorText(err, `„${fileName}“ konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.`),
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-color-text-secondary w-full sm:w-70">
        Möchten Sie wirklich löschen &bdquo;
        <span className="font-semibold text-color-text-primary break-all">
          {fileName}
        </span>
        &ldquo;?
      </p>
      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button
          text="Löschen"
          variant="danger"
          onClick={handleConfirm}
          isLoading={isLoading}
        />
      </ModalActions>
    </div>
  );
};
