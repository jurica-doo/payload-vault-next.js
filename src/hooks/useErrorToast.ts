import { useCallback } from "react";
import { useBanner } from "../context/banner/BannerContext";
import { errorText } from "../utils/dbErrors";

/**
 * Error toast for fire-and-forget mutations (`mutate(vars, { onError })`),
 * so a failed click never goes unnoticed.
 *
 *   const onFail = useErrorToast();
 *   setStatus.mutate(vars, { onError: onFail("Aufgabe nicht aktualisiert") });
 */
export const useErrorToast = () => {
  const { showBanner } = useBanner();
  return useCallback(
    (title: string) => (error: unknown) =>
      showBanner(title, errorText(error), "error"),
    [showBanner],
  );
};
