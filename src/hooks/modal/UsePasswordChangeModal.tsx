import { PasswordChangeForm } from "../../components/modal/PasswordChangeForm";
import { useModal } from "../../context/modal/ModalContext";

type UsePasswordChangeProps = {
  onSave: (newPassword: string) => Promise<void>;
};

export const useChangePasswordModal = ({ onSave }: UsePasswordChangeProps) => {
  const { openModal, closeModal } = useModal();

  const openChangePasswordModal = () => {
    openModal({
      title: "Passwort ändern",
      children: <PasswordChangeForm onCancel={closeModal} onSave={onSave} />,
    });
  };

  return {
    openChangePasswordModal,
    closeModal,
  };
};
