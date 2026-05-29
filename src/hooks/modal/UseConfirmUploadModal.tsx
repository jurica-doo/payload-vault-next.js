import { PdfConfirmationForm } from "../../components/modal/PdfConfirmationForm";
import { useModal } from "../../context/modal/ModalContext";
import type { PendingUpload } from "../../hooks/usePdf/usePendingUpload";
import type { ModalSize } from "../../context/modal/types";

type UseConfirmUploadModalProps = {
  onConfirm: (upload: PendingUpload) => Promise<void>;
  onDecline: (upload: PendingUpload) => Promise<void>;
  onComplete: () => void;
};

export const useConfirmUploadModal = ({
  onConfirm,
  onDecline,
  onComplete,
}: UseConfirmUploadModalProps) => {
  const { openModal, closeModal, setDisableClose } = useModal();

  const openConfirmUploadModal = (pendingUploads: PendingUpload[]) => {
    if (pendingUploads.length === 0) {
      onComplete();
      return;
    }

    const isSingleUpload = pendingUploads.length === 1;
    const title = isSingleUpload
      ? pendingUploads[0].fileName
      : `${pendingUploads.length} Dokumente bestätigen`;
    const size: ModalSize = isSingleUpload ? "default" : "large";

    const handleConfirmAll = async (uploads: PendingUpload[]) => {
      setDisableClose(true);
      try {
        for (const upload of uploads) {
          await onConfirm(upload);
        }
      } finally {
        setDisableClose(false);
      }
    };

    const handleDeclineAll = async (uploads: PendingUpload[]) => {
      setDisableClose(true);
      try {
        for (const upload of uploads) {
          await onDecline(upload);
        }
      } finally {
        setDisableClose(false);
      }
    };

    const handleConfirmSingle = async (upload: PendingUpload) => {
      setDisableClose(true);
      try {
        await onConfirm(upload);
      } finally {
        setDisableClose(false);
      }
    };

    const handleDeclineSingle = async (upload: PendingUpload) => {
      setDisableClose(true);
      try {
        await onDecline(upload);
      } finally {
        setDisableClose(false);
      }
    };

    const handleClose = () => {
      closeModal();
    };

    openModal({
      title,
      size,
      onClose: onComplete,
      children: (
        <PdfConfirmationForm
          pendingUploads={pendingUploads}
          onConfirm={handleConfirmSingle}
          onDecline={handleDeclineSingle}
          onConfirmAll={handleConfirmAll}
          onDeclineAll={handleDeclineAll}
          onClose={handleClose}
        />
      ),
    });
  };

  return {
    openConfirmUploadModal,
    closeModal,
  };
};
