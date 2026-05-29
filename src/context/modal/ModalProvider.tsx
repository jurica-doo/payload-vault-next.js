import { useState, useRef, useCallback, type ReactNode } from "react";
import { type ModalState, type ModalData } from "./types";
import { ModalContext } from "./ModalContext";
import { Modal } from "../../components/modal/Modal";

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false });
  const modalStateRef = useRef(modalState);
  modalStateRef.current = modalState;

  const openModal = (data: ModalData) =>
    setModalState({ isOpen: true, ...data });
  const closeModal = useCallback(() => {
    const current = modalStateRef.current;
    if (current.isOpen && current.onClose) {
      current.onClose();
    }
    setModalState({ isOpen: false });
  }, []);
  const setDisableClose = (disabled: boolean) =>
    setModalState((prev) =>
      prev.isOpen ? { ...prev, disableClose: disabled } : prev,
    );

  return (
    <ModalContext.Provider
      value={{ modalState, openModal, closeModal, setDisableClose }}
    >
      {children}

      {modalState.isOpen && (
        <Modal
          title={modalState.title}
          onClose={closeModal}
          disableClose={modalState.disableClose}
          size={modalState.size}
        >
          {modalState.children}
        </Modal>
      )}
    </ModalContext.Provider>
  );
};
