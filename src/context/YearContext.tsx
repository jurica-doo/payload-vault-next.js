import { createContext, useState, useEffect, type ReactNode } from "react";
import { useAvailableYears } from "../hooks/year/useAvailableYears";

type YearContextValue = {
  year: number;
  setYear: (year: number) => void;
  availableYears: number[];
  isLoadingYears: boolean;
  refetchYears: () => Promise<void>;
};

export const YearContext = createContext<YearContextValue | undefined>(
  undefined
);

const storageKey = "selectedYear";

export function YearProvider({ children }: { children: ReactNode }) {
  const {
    availableYears,
    isLoading: isLoadingYears,
    refetch: refetchYears,
  } = useAvailableYears();

  const [year, setYear] = useState<number>(() => {
    if (typeof window === "undefined") {
      return new Date().getFullYear();
    }

    const storedYear = localStorage.getItem(storageKey);
    return storedYear ? Number(storedYear) : new Date().getFullYear();
  });

  useEffect(() => {
    localStorage.setItem(storageKey, year.toString());
  }, [year]);

  useEffect(() => {
    if (!isLoadingYears && availableYears.length > 0 && !availableYears.includes(year)) {
      setYear(new Date().getFullYear());
    }
  }, [availableYears, isLoadingYears, year]);

  return (
    <YearContext.Provider
      value={{ year, setYear, availableYears, isLoadingYears, refetchYears }}
    >
      {children}
    </YearContext.Provider>
  );
}
