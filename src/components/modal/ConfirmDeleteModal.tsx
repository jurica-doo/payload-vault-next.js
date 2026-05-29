import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { Button } from "../button/Button";

interface ConfirmDeleteModalProps {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteModal = ({
  title,
  message,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) => {
  return createPortal(
    <Modal title={title} onClose={onCancel}>
      <div className="flex flex-col gap-6 pt-2">
        <p className="text-color-text-secondary">{message}</p>
        <div className="mt-6 flex flex-wrap gap-3 sm:gap-6">
          <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
          <Button text="Löschen" variant="decline" onClick={onConfirm} />
        </div>
      </div>
    </Modal>,
    document.body,
  );
};
