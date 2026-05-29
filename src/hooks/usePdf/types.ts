import type { Database } from "../../types/supabase";

type PdfRecord = Database["public"]["Tables"]["pdf_records"]["Row"] & {
  signed_url?: string;
};
type NewPdf = Database["public"]["Tables"]["pdf_records"]["Insert"];
type SortTypes = "new" | "old" | "high" | "low";
type HomeSort = "low" | "high" | "most" | "least";
type Category = Database["public"]["Enums"]["document_category"] | "all";
type ExpenseCategory = Database["public"]["Enums"]["expense_category"] | "all";

type FetchPdfProps = {
  userId: string;
  category?: Category;
  year?: number;
  startMonth?: number;
  endMonth?: number;
  sortBy?: SortTypes;
};

export type {
  Category,
  ExpenseCategory,
  FetchPdfProps,
  HomeSort,
  NewPdf,
  PdfRecord,
  SortTypes,
};
