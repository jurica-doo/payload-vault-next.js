import { useState, useRef, useEffect } from "react";
import { Button } from "../button/Button";
import { Dropdown } from "../dropdown/Dropdown";
import { InputField } from "../inputField/InputField";
import type { Option } from "../dropdown/Dropdown.types";
import type {
  PendingExpenseUpload,
  ConfirmReceiptPayload,
  ExpenseCategory,
} from "../../hooks/useExpenses/types";
import {
  expenseCategories,
  DEFAULT_EXPENSE_CATEGORY,
} from "../../hooks/useExpenses/types";

const EXPENSE_CATEGORY_OPTIONS: Option[] = expenseCategories.map((cat) => ({
  id: cat,
  label: cat,
}));

interface ExpenseConfirmationFormProps {
  pendingUploads: PendingExpenseUpload[];
  onConfirmReceipt: (payload: ConfirmReceiptPayload) => Promise<void>;
  onDeclineReceipt: (filePath: string) => Promise<void>;
  onClose: () => void;
}

type EditableProduct = {
  id: string;
  product_name: string;
  amount: string;
  category: ExpenseCategory;
};

type ReceiptState = {
  id: string;
  fileName: string;
  filePath: string;
  expense_date: string;
  vendor_name: string;
  image_url: string;
  file_name: string;
  products: EditableProduct[];
};

export const ExpenseConfirmationForm = ({
  pendingUploads,
  onConfirmReceipt,
  onDeclineReceipt,
  onClose,
}: ExpenseConfirmationFormProps) => {
  const [receipts, setReceipts] = useState<ReceiptState[]>(() =>
    pendingUploads.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      filePath: u.filePath,
      expense_date: u.expense_date,
      vendor_name: u.vendor_name,
      image_url: u.image_url,
      file_name: u.file_name,
      products: u.products.map((p) => ({
        id: p.id,
        product_name: p.product_name,
        amount: String(p.amount),
        category: p.category,
      })),
    })),
  );

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;

  const hasReceipts = receipts.length > 0;

  useEffect(() => {
    if (!hasReceipts) {
      onClose();
    }
  }, [hasReceipts, onClose]);

  const hasInteractedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!hasInteractedRef.current) return;
      receiptsRef.current.forEach((receipt) => {
        onDeclineReceipt(receipt.filePath).catch(console.error);
      });
    };
  }, [onDeclineReceipt]);

  if (!hasReceipts) return null;

  // --- Receipt-level field updates ---
  const updateReceiptField = (
    id: string,
    field: "expense_date" | "vendor_name",
    value: string,
  ) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  // --- Product-level field updates ---
  const updateProductField = (
    receiptId: string,
    productId: string,
    field: keyof EditableProduct,
    value: string,
  ) => {
    setReceipts((prev) =>
      prev.map((r) =>
        r.id === receiptId
          ? {
              ...r,
              products: r.products.map((p) =>
                p.id === productId ? { ...p, [field]: value } : p,
              ),
            }
          : r,
      ),
    );
  };

  // --- Add new product to a receipt ---
  const addProduct = (receiptId: string) => {
    setReceipts((prev) =>
      prev.map((r) =>
        r.id === receiptId
          ? {
              ...r,
              products: [
                ...r.products,
                {
                  id: crypto.randomUUID(),
                  product_name: "",
                  amount: "0",
                  category: DEFAULT_EXPENSE_CATEGORY,
                },
              ],
            }
          : r,
      ),
    );
  };

  // --- Remove a single product from a receipt ---
  const handleRemoveProduct = (receiptId: string, productId: string) => {
    hasInteractedRef.current = true;
    setReceipts((prev) =>
      prev.map((r) => {
        if (r.id !== receiptId) return r;
        const remaining = r.products.filter((p) => p.id !== productId);
        return { ...r, products: remaining };
      }),
    );
  };

  // --- Confirm entire receipt (save all remaining products as one row) ---
  const handleConfirmReceipt = async (receipt: ReceiptState) => {
    if (receipt.products.length === 0) return;

    hasInteractedRef.current = true;
    setProcessingIds((prev) => new Set(prev).add(receipt.id));
    try {
      const products = receipt.products.map((p) => ({
        product_name: p.product_name,
        amount: parseFloat(p.amount) || 0,
        category: p.category,
      }));

      const totalAmount = products.reduce((sum, p) => sum + p.amount, 0);

      // Use the category of the most expensive product as the receipt category
      const mainCategory = products.reduce((best, p) =>
        p.amount > best.amount ? p : best,
      ).category;

      await onConfirmReceipt({
        products,
        amount: totalAmount,
        category: mainCategory,
        expense_date: receipt.expense_date,
        vendor_name: receipt.vendor_name,
        image_url: receipt.image_url,
        file_name: receipt.file_name,
      });

      setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(receipt.id);
        return next;
      });
    }
  };

  // --- Decline entire receipt ---
  const handleDeclineReceipt = (receipt: ReceiptState) => {
    hasInteractedRef.current = true;
    onDeclineReceipt(receipt.filePath).catch(console.error);
    setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
  };

  const getCategoryOption = (category: ExpenseCategory): Option | null =>
    EXPENSE_CATEGORY_OPTIONS.find((opt) => opt.id === category) || null;

  return (
    <div className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto pr-1">
      {receipts.map((receipt) => {
        const isProcessing = processingIds.has(receipt.id);
        const hasProducts = receipt.products.length > 0;

        return (
          <div
            key={receipt.id}
            className="flex flex-col gap-4 rounded-lg bg-color-bg-dark p-4"
          >
            {/* Receipt header */}
            <h3 className="font-semibold text-color-text-main truncate">
              {receipt.fileName}
            </h3>

            {/* Receipt-level fields: vendor & date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                label="Anbieter"
                type="text"
                placeholder="z.B. REWE, Shell"
                value={receipt.vendor_name}
                onChange={(val) =>
                  updateReceiptField(receipt.id, "vendor_name", val)
                }
              />
              <div className="flex flex-col gap-1">
                <label className="flex h-6 items-center font-semibold text-color-text-secondary">
                  <span className="ml-1 text-[14px]">Datum</span>
                </label>
                <input
                  type="date"
                  value={receipt.expense_date}
                  onChange={(e) =>
                    updateReceiptField(receipt.id, "expense_date", e.target.value)
                  }
                  className="w-full rounded-radius-md border border-color-border-light bg-color-bg-main px-4 py-3 text-color-text-main transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-color-bg-accent"
                />
              </div>
            </div>

            <div className="border-t border-color-border-light" />

            {/* Products header */}
            <span className="text-sm font-semibold text-color-text-secondary">
              Produkte ({receipt.products.length})
            </span>

            {/* Product rows */}
            {receipt.products.map((product) => (
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
                      updateProductField(
                        receipt.id,
                        product.id,
                        "product_name",
                        val,
                      )
                    }
                  />
                  <InputField
                    label="Betrag (€)"
                    type="number"
                    placeholder="0.00"
                    value={product.amount}
                    onChange={(val) =>
                      updateProductField(receipt.id, product.id, "amount", val)
                    }
                  />
                  <Dropdown
                    label="Kategorie"
                    options={EXPENSE_CATEGORY_OPTIONS}
                    value={getCategoryOption(product.category)}
                    onSelect={(opt) =>
                      updateProductField(
                        receipt.id,
                        product.id,
                        "category",
                        opt.id as string,
                      )
                    }
                    placeholder="Kategorie"
                  />
                </div>

                {/* Remove product button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleRemoveProduct(receipt.id, product.id)}
                    disabled={isProcessing}
                    className="rounded-md px-3 py-1.5 text-sm font-medium bg-color-error-border text-white hover:bg-color-error-border/80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 active:scale-95"
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            ))}

            {/* Add product button */}
            <button
              onClick={() => addProduct(receipt.id)}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-md border border-dashed border-color-border-light px-3 py-2 text-sm text-color-text-secondary hover:bg-color-bg-main/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:border-color-primary/50"
            >
              <span className="text-lg leading-none">+</span>
              <span>Produkt hinzufügen</span>
            </button>

            {/* Receipt-level action buttons */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-color-border-light">
              <Button
                variant="primary"
                text={hasProducts ? "Beleg bestätigen" : "Keine Produkte"}
                onClick={() => handleConfirmReceipt(receipt)}
                isDisabled={isProcessing || !hasProducts}
              />
              <Button
                variant="secondary"
                text="Beleg ablehnen"
                onClick={() => handleDeclineReceipt(receipt)}
                isDisabled={isProcessing}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
