import { ExpenseConfirmationForm } from "../../components/modal/ExpenseConfirmationForm";
import { useModal } from "../../context/modal/ModalContext";
import type {
  PendingExpenseUpload,
  ConfirmReceiptPayload,
} from "../useExpenses/types";

type UseExpenseConfirmUploadModalProps = {
  onConfirmReceipt: (payload: ConfirmReceiptPayload) => Promise<void>;
  onDeclineReceipt: (filePath: string) => Promise<void>;
  onComplete: () => void;
};

export const useExpenseConfirmUploadModal = ({
  onConfirmReceipt,
  onDeclineReceipt,
  onComplete,
}: UseExpenseConfirmUploadModalProps) => {
  const { openModal, closeModal, setDisableClose } = useModal();

  const openExpenseConfirmUploadModal = (
    pendingUploads: PendingExpenseUpload[],
  ) => {
    if (pendingUploads.length === 0) {
      onComplete();
      return;
    }

    const totalProducts = pendingUploads.reduce(
      (sum, u) => sum + u.products.length,
      0,
    );
    const title =
      pendingUploads.length === 1
        ? pendingUploads[0].fileName
        : `${pendingUploads.length} Belege · ${totalProducts} Produkte`;

    openModal({
      title,
      size: "large",
      onClose: onComplete,
      children: (
        <ExpenseConfirmationForm
          pendingUploads={pendingUploads}
          onConfirmReceipt={async (payload) => {
            setDisableClose(true);
            try {
              await onConfirmReceipt(payload);
            } finally {
              setDisableClose(false);
            }
          }}
          onDeclineReceipt={onDeclineReceipt}
          onClose={closeModal}
        />
      ),
    });
  };

  return {
    openExpenseConfirmUploadModal,
    closeModal,
  };
};
