import { useContext } from "react";
import { YearContext } from "../../context/YearContext";

export function useYear() {
  const context = useContext(YearContext);

  if (!context) {
    throw new Error("useYear muss innerhalb eines YearProvider verwendet werden");
  }

  return context;
}
