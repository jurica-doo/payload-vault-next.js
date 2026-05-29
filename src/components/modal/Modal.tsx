import { type ReactNode, useCallback, useEffect, useState } from "react";
import { CloseIcon } from "../icons";
import type { ModalSize } from "../../context/modal/types";

interface ModalProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  disableClose?: boolean;
  size?: ModalSize;
}

const ANIMATION_DURATION = 150;

const sizeClasses: Record<ModalSize, string> = {
  default: "max-w-md",
  large: "max-w-2xl",
};

export const Modal = ({
  title,
  onClose,
  children,
  disableClose,
  size = "default",
}: ModalProps) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    if (disableClose || isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, ANIMATION_DURATION);
  }, [disableClose, isClosing, onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4 ${
        isClosing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full ${sizeClasses[size]} flex-col gap-4 overflow-y-auto rounded-lg bg-color-bg-card p-4 sm:p-6 shadow-shadow-strong ${
          isClosing ? "animate-scale-out" : "animate-scale-in"
        }`}
      >
        <div className="flex w-full items-start justify-between gap-4">
          <h6 className="text-[20px] font-bold">{title}</h6>
          <button
            onClick={handleClose}
            disabled={disableClose}
            className={`shrink-0 rounded-radius-md p-2 transition-all duration-200 ease-in-out ${
              disableClose
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-color-primary/20 active:scale-90"
            }`}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex w-full flex-col">
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
};
