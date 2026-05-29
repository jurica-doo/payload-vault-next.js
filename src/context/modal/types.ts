import type { ReactNode } from "react";

export type ModalSize = "default" | "large";

export type ModalData = {
  title: string;
  children?: ReactNode;
  disableClose?: boolean;
  size?: ModalSize;
  onClose?: () => void;
};

export type ModalState = { isOpen: false } | ({ isOpen: true } & ModalData);

export type ModalContextValue = {
  modalState: ModalState;
  openModal: (data: ModalData) => void;
  closeModal: () => void;
  setDisableClose: (disabled: boolean) => void;
};
