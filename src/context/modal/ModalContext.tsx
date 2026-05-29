import { createContext, useContext } from "react";
import { type ModalContextValue } from "./types";

export const ModalContext = createContext<ModalContextValue | null>(null);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useModal has to be used within ModalProvider");
  return context;
};
