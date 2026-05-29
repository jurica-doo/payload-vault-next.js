import { useState } from "react";
import { Button } from "../button/Button";
import { DownloadIcon } from "../icons/DownloadIcon";
import { useBanner } from "../../context/banner/BannerContext";
import { useAuth } from "../../context/AuthContext";
import type { PdfRecord } from "../../hooks/usePdf/types";
import type { ExpenseRecord } from "../../hooks/useExpenses/types";

type TaxReportButtonProps = {
  pdfs: PdfRecord[];
  expenses: ExpenseRecord[];
  year: number;
};

export const TaxReportButton = ({
  pdfs,
  expenses,
  year,
}: TaxReportButtonProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { showBanner } = useBanner();
  const { user } = useAuth();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { generateTaxReport } = await import(
        "../../utils/taxReport/generateTaxReport"
      );
      const email = user?.email ?? "benutzer";
      await generateTaxReport(pdfs, expenses, year, email);
      showBanner("Steuerbericht", "PDF wurde erfolgreich erstellt.", "success");
    } catch {
      showBanner(
        "Fehler",
        "Steuerbericht konnte nicht erstellt werden. Bitte versuchen Sie es erneut.",
        "error",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      text={isGenerating ? "Wird erstellt..." : "Steuerbericht erstellen"}
      icon={DownloadIcon}
      isLoading={isGenerating}
      variant="primary"
      size="small"
      onClick={handleGenerate}
    />
  );
};
