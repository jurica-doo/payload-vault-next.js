import type { Category } from "../../hooks/usePdf/types";
import type { ExpenseCategory, StoredProduct } from "../../hooks/useExpenses/types";

type SinglePdf = {
  id: string;
  title: string;
  date: string;
  signedUrl: string;
  openLink: string;
  category: Category;
  income: number;
};

type SingleExpensePdf = {
  amount: number;
  category: ExpenseCategory;
  created_at: string;
  expense_date: string;
  file_name: string;
  id: string;
  image_url: string;
  signed_url: string;
  user_id: string;
  vendor_name: string;
  products: StoredProduct[];
};

type AllPdfTypes = {
  totalIncome: number;
  totalPdf: number;
  pdfs: SinglePdf[];
};

type AllExpensePdfTypes = {
  totalIncome: number;
  totalPdf: number;
  pdfs: SingleExpensePdf[];
};

export type { SinglePdf, AllPdfTypes, SingleExpensePdf, AllExpensePdfTypes };
