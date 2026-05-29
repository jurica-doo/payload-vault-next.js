"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type TitleContextValue = {
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
};

const TitleContext = createContext<TitleContextValue | undefined>(undefined);

export const TitleProvider = ({ children }: { children: ReactNode }) => {
  const [title, setTitle] = useState("");

  return (
    <TitleContext.Provider value={{ title, setTitle }}>
      {children}
    </TitleContext.Provider>
  );
};

/**
 * Replaces react-router's `useOutletContext<{ setTitle }>()` from the old
 * Vite app. Provided by the dashboard route-group layout.
 */
export const useTitle = () => {
  const context = useContext(TitleContext);
  if (!context) {
    throw new Error("useTitle must be used within a TitleProvider");
  }
  return context;
};
