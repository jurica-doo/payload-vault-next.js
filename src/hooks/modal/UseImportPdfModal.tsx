import {
  ImportPdfForm,
  type UploadProgress,
} from "../../components/modal/ImportPdfForm";
import { useModal } from "../../context/modal/ModalContext";

type UseImportPdfModalProps = {
  onSave: (
    files: File[],
    onProgress: (progress: UploadProgress) => void,
  ) => Promise<void>;
};

export const useImportPdfModal = ({ onSave }: UseImportPdfModalProps) => {
  const { openModal, closeModal } = useModal();

  const openImportPdfModal = () => {
    openModal({
      title: "Dokument importieren",
      children: <ImportPdfForm onCancel={closeModal} onSave={onSave} />,
    });
  };

  return {
    openImportPdfModal,
    closeModal,
  };
};
