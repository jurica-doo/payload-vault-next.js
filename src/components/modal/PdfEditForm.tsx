import { useState } from "react";
import { Button } from "../button/Button";
import { Dropdown } from "../dropdown/Dropdown";
import { InputField } from "../inputField/InputField";
import type { PdfCategory } from "../../hooks/usePdf/usePendingUpload";
import type { Option } from "../dropdown/Dropdown.types";
import { useBanner } from "../../context/banner/BannerContext";

const CATEGORY_OPTIONS: Option[] = [
  { id: "Strom & Gas", label: "Strom & Gas" },
  { id: "Barmenia Abrechnung", label: "Barmenia Abrechnung" },
  { id: "IKK Abrechnung", label: "IKK Abrechnung" },
  { id: "Adcuri Abschlussprovision", label: "Adcuri Abschlussprovision" },
  { id: "Adcuri Bestandsprovision", label: "Adcuri Bestandsprovision" },
];

interface PdfEditFormProps {
  pdfId: string;
  fileName: string;
  category: PdfCategory;
  profit: number;
  dateCreated: string;
  onSave: (data: {
    id: string;
    category: PdfCategory;
    profit: number;
    date_created: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export const PdfEditForm = ({
  pdfId,
  fileName,
  category: initialCategory,
  profit: initialProfit,
  dateCreated: initialDate,
  onSave,
  onCancel,
}: PdfEditFormProps) => {
  const { showBanner } = useBanner();
  const [isLoading, setIsLoading] = useState(false);

  const [category, setCategory] = useState<PdfCategory>(initialCategory);
  const [profit, setProfit] = useState(String(initialProfit));
  const [dateCreated, setDateCreated] = useState(initialDate);

  const getCategoryOption = (cat: PdfCategory): Option | null =>
    CATEGORY_OPTIONS.find((opt) => opt.id === cat) || null;

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await onSave({
        id: pdfId,
        category,
        profit: parseFloat(profit) || 0,
        date_created: dateCreated,
      });

      showBanner(
        "Dokument aktualisiert",
        `"${fileName}" wurde erfolgreich aktualisiert.`,
        "success",
      );
      onCancel();
    } catch {
      showBanner(
        "Fehler",
        `Beim Aktualisieren von "${fileName}" ist ein Fehler aufgetreten.`,
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg bg-color-bg-dark p-4">
        <h3 className="font-semibold text-color-text-main truncate">
          {fileName}
        </h3>

        <Dropdown
          label="Kategorie"
          options={CATEGORY_OPTIONS}
          value={getCategoryOption(category)}
          onSelect={(opt) => setCategory(opt.id as PdfCategory)}
          placeholder="Kategorie wählen"
        />

        <InputField
          label="Gewinn (€)"
          type="number"
          placeholder="0.00"
          value={profit}
          onChange={setProfit}
        />

        <div className="flex flex-col gap-1">
          <label className="flex h-6 items-center font-semibold text-color-text-secondary">
            <span className="ml-1 text-[14px]">Datum</span>
          </label>
          <input
            type="date"
            value={dateCreated}
            onChange={(e) => setDateCreated(e.target.value)}
            className="w-full rounded-radius-md border border-color-border-light bg-color-bg-main px-4 py-3 text-color-text-main transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-color-bg-accent"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          variant="secondary"
          text="Abbrechen"
          onClick={onCancel}
          isDisabled={isLoading}
        />
        <Button
          variant="primary"
          text="Speichern"
          onClick={handleSave}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
