import { useState } from "react";
import { Button } from "../button/Button";
import { Dropdown } from "../dropdown/Dropdown";
import { InputField } from "../inputField/InputField";
import type { Option } from "../dropdown/Dropdown.types";
import type {
  ExpenseCategory,
  StoredProduct,
} from "../../hooks/useExpenses/types";
import {
  expenseCategories,
  DEFAULT_EXPENSE_CATEGORY,
} from "../../hooks/useExpenses/types";
import { useBanner } from "../../context/banner/BannerContext";

const EXPENSE_CATEGORY_OPTIONS: Option[] = expenseCategories.map((cat) => ({
  id: cat,
  label: cat,
}));

type EditableProduct = {
  id: string;
  product_name: string;
  amount: string;
  category: ExpenseCategory;
};

interface ExpenseEditFormProps {
  expenseId: string;
  fileName: string;
  expenseDate: string;
  vendorName: string;
  products: StoredProduct[];
  onSave: (data: {
    id: string;
    category: ExpenseCategory;
    amount: number;
    expense_date: string;
    vendor_name: string;
    products: StoredProduct[];
  }) => Promise<void>;
  onCancel: () => void;
}

export const ExpenseEditForm = ({
  expenseId,
  fileName,
  expenseDate,
  vendorName,
  products: initialProducts,
  onSave,
  onCancel,
}: ExpenseEditFormProps) => {
  const { showBanner } = useBanner();
  const [isLoading, setIsLoading] = useState(false);

  const [date, setDate] = useState(expenseDate);
  const [vendor, setVendor] = useState(vendorName);
  const [products, setProducts] = useState<EditableProduct[]>(() =>
    initialProducts.map((p) => ({
      id: crypto.randomUUID(),
      product_name: p.product_name,
      amount: String(p.amount),
      category: p.category,
    })),
  );

  const updateProductField = (
    productId: string,
    field: keyof EditableProduct,
    value: string,
  ) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, [field]: value } : p)),
    );
  };

  const addProduct = () => {
    setProducts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        product_name: "",
        amount: "0",
        category: DEFAULT_EXPENSE_CATEGORY,
      },
    ]);
  };

  const removeProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const getCategoryOption = (category: ExpenseCategory): Option | null =>
    EXPENSE_CATEGORY_OPTIONS.find((opt) => opt.id === category) || null;

  const handleSave = async () => {
    if (products.length === 0) return;

    setIsLoading(true);
    try {
      const storedProducts: StoredProduct[] = products.map((p) => ({
        product_name: p.product_name,
        amount: parseFloat(p.amount) || 0,
        category: p.category,
      }));

      const totalAmount = storedProducts.reduce(
        (sum, p) => sum + p.amount,
        0,
      );

      const mainCategory = storedProducts.reduce((best, p) =>
        p.amount > best.amount ? p : best,
      ).category;

      await onSave({
        id: expenseId,
        category: mainCategory,
        amount: totalAmount,
        expense_date: date,
        vendor_name: vendor,
        products: storedProducts,
      });

      showBanner(
        "Beleg aktualisiert",
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
    <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="flex flex-col gap-4 rounded-lg bg-color-bg-dark p-4">
        <h3 className="font-semibold text-color-text-main truncate">
          {fileName}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputField
            label="Anbieter"
            type="text"
            placeholder="z.B. REWE, Shell"
            value={vendor}
            onChange={setVendor}
          />
          <div className="flex flex-col gap-1">
            <label className="flex h-6 items-center font-semibold text-color-text-secondary">
              <span className="ml-1 text-[14px]">Datum</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-radius-md border border-color-border-light bg-color-bg-main px-4 py-3 text-color-text-main transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-color-bg-accent"
            />
          </div>
        </div>

        <div className="border-t border-color-border-light" />

        <span className="text-sm font-semibold text-color-text-secondary">
          Produkte ({products.length})
        </span>

        {products.map((product) => (
          <div
            key={product.id}
            className="flex flex-col gap-3 rounded-md bg-color-bg-main p-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InputField
                label="Produkt"
                type="text"
                placeholder="Produktname"
                value={product.product_name}
                onChange={(val) =>
                  updateProductField(product.id, "product_name", val)
                }
              />
              <InputField
                label="Betrag (€)"
                type="number"
                placeholder="0.00"
                value={product.amount}
                onChange={(val) =>
                  updateProductField(product.id, "amount", val)
                }
              />
              <Dropdown
                label="Kategorie"
                options={EXPENSE_CATEGORY_OPTIONS}
                value={getCategoryOption(product.category)}
                onSelect={(opt) =>
                  updateProductField(
                    product.id,
                    "category",
                    opt.id as string,
                  )
                }
                placeholder="Kategorie"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => removeProduct(product.id)}
                disabled={isLoading}
                className="rounded-md px-3 py-1.5 text-sm font-medium bg-color-error-border text-white hover:bg-color-error-border/80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 active:scale-95"
              >
                Entfernen
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={addProduct}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md border border-dashed border-color-border-light px-3 py-2 text-sm text-color-text-secondary hover:bg-color-bg-main/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:border-color-primary/50"
        >
          <span className="text-lg leading-none">+</span>
          <span>Produkt hinzufügen</span>
        </button>
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
          isDisabled={products.length === 0}
        />
      </div>
    </div>
  );
};
