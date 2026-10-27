import { useState, type ReactNode } from "react";
import { Button } from "../button/Button";
import { AlertTriangleIcon } from "../icons";
import { ModalActions } from "./ModalActions";

type ConfirmDialogProps = {
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Destructive confirmations get the red button and warning icon. */
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/** Body for a confirmation modal opened via useModal().openModal. */
export const ConfirmDialog = ({
  message,
  confirmText = "Bestätigen",
  cancelText = "Abbrechen",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {tone === "danger" && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-color-bg-error-subtle text-color-error-text">
            <AlertTriangleIcon size={18} />
          </span>
        )}
        <div className="pt-1.5 text-sm text-color-text-secondary">{message}</div>
      </div>
      <ModalActions>
        <Button variant="secondary" text={cancelText} onClick={onCancel} isDisabled={busy} />
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          text={confirmText}
          isLoading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        />
      </ModalActions>
    </div>
  );
};
