import { LogoutModalForm } from "../../components/modal/LogoutModal";
import { useModal } from "../../context/modal/ModalContext";

type UseLogoutProps = {
  onSave: () => Promise<void>;
};

export const useLogoutModal = ({ onSave }: UseLogoutProps) => {
  const { openModal, closeModal } = useModal();

  const openLogoutModal = () => {
    openModal({
      title: "Abmelden",
      children: <LogoutModalForm onCancel={closeModal} onSave={onSave} />,
    });
  };

  return {
    openLogoutModal,
    closeModal,
  };
};
