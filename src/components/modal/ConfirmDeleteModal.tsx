import { ModalActions } from "./ModalActions";
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
      <div className="flex flex-col gap-5">
        <p className="text-color-text-secondary">{message}</p>
        <ModalActions>
          <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
          <Button text="Löschen" variant="danger" onClick={onConfirm} />
        </ModalActions>
      </div>
    </Modal>,
    document.body,
  );
};
