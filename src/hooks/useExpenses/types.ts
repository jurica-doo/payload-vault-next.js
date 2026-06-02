import { Constants, type Database } from "../../types/supabase";

type ExpenseRecord = Database["public"]["Tables"]["expenses"]["Row"] & {
  signed_url?: string;
};

type NewExpense = Database["public"]["Tables"]["expenses"]["Insert"];
type ExpenseCategory = Database["public"]["Enums"]["expense_category"];

type StoredProduct = {
  product_name: string;
  amount: number;
  category: ExpenseCategory;
};

type ExtractedProduct = {
  id: string;
  product_name: string;
  amount: number;
  category: ExpenseCategory;
};

type ConfirmReceiptPayload = {
  products: StoredProduct[];
  amount: number;
  category: ExpenseCategory;
  expense_date: string;
  vendor_name: string;
  image_url: string;
  file_name: string;
};

const expenseCategories = Constants.public.Enums
  .expense_category as readonly ExpenseCategory[];

const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "Sonstiges";

const expenseCategorySet = new Set<ExpenseCategory>(expenseCategories);

function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    expenseCategorySet.has(value as ExpenseCategory)
  );
}

export type SortType = "new" | "old" | "high" | "low";

type FetchExpensesProps = {
  userId: string;
  category?: ExpenseCategory | "all";
  year?: number;
  sortBy?: SortType;
  startMonth?: number;
  endMonth?: number;
};

type DuplicateMatch = {
  file_name: string;
  signed_url: string;
};

type PendingExpenseUpload = {
  id: string;
  fileName: string;
  filePath: string;
  expense_date: string;
  vendor_name: string;
  image_url: string;
  file_name: string;
  products: ExtractedProduct[];
  isDuplicate?: boolean;
  duplicateMatch?: DuplicateMatch;
};

export type {
  ConfirmReceiptPayload,
  DuplicateMatch,
  ExpenseCategory,
  ExpenseRecord,
  ExtractedProduct,
  FetchExpensesProps,
  NewExpense,
  PendingExpenseUpload,
  StoredProduct,
};
export { DEFAULT_EXPENSE_CATEGORY, expenseCategories, isExpenseCategory };
