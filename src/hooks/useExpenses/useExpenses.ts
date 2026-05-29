import type { PostgrestError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  ConfirmReceiptPayload,
  ExpenseCategory,
  ExpenseRecord,
  FetchExpensesProps,
  PendingExpenseUpload,
  SortType,
  StoredProduct,
} from "./types";
import { isExpenseCategory, DEFAULT_EXPENSE_CATEGORY } from "./types";

export class ExtractionExpenseError extends Error {
  rejectionReason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "ExtractionExpenseError";
    this.rejectionReason = reason;
  }
}

function sanitizeFileName(fileName: string): string {
  // Strip path separators to prevent directory traversal
  const baseName = fileName.split(/[/\\]/).pop() ?? fileName;
  return baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^[._-]+/, "") // Don't start with dot, dash, or underscore
    .slice(0, 200); // Cap length
}
async function deleteImageFromStorage(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from("expense_invoices")
    .remove([path]);
  if (error) console.error("Error removing storage file:", error.message);
}

export function isSortType(value: string): value is SortType {
  return ["new", "old", "high", "low"].includes(value);
}

export function useFetchExpenses(props: FetchExpensesProps) {
  return useQuery<ExpenseRecord[], PostgrestError>({
    queryKey: [
      "expenses",
      props.userId,
      props.category ?? "all",
      props.year ?? "all",
      props.startMonth ?? "all",
      props.endMonth ?? "all",
      props.sortBy ?? "new",
    ],
    queryFn: async () => {
      let q = supabase.from("expenses").select("*").eq("user_id", props.userId);

      if (props.category && props.category !== "all") {
        q = q.eq("category", props.category);
      }

      if (props.year) {
        const startMonth = props.startMonth ?? 1;
        const endMonth = props.endMonth ?? 12;

        const startDate = `${props.year}-${String(startMonth).padStart(
          2,
          "0",
        )}-01`;
        const endDay = new Date(props.year, endMonth, 0).getDate();
        const endDate = `${props.year}-${String(endMonth).padStart(
          2,
          "0",
        )}-${endDay}`;

        q = q.gte("expense_date", startDate).lte("expense_date", endDate);
      }

      switch (props.sortBy) {
        case "old":
          q = q.order("expense_date", { ascending: true });
          break;
        case "high":
          q = q.order("amount", { ascending: false });
          break;
        case "low":
          q = q.order("amount", { ascending: true });
          break;
        case "new":
        default:
          q = q.order("expense_date", { ascending: false });
          break;
      }

      const { data, error } = await q;
      if (error) throw error;

      const filePaths = data.map((e) => e.image_url).filter(Boolean);
      if (filePaths.length === 0) return data;

      const { data: signedUrls, error: signedUrlsError } =
        await supabase.storage
          .from("expense_invoices")
          .createSignedUrls(filePaths, 900);

      if (signedUrlsError) throw signedUrlsError;

      return data.map((expense) => ({
        ...expense,
        signed_url:
          signedUrls?.find((s) => expense.image_url === s.path)?.signedUrl ??
          "",
      }));
    },
    enabled: !!props.userId,
  });
}

export function useUploadAndExtract(userId: string) {
  return useMutation<PendingExpenseUpload, Error, File>({
    mutationFn: async (file) => {
      const dot = file.name.lastIndexOf(".");
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      const ext = dot > 0 ? file.name.slice(dot) : "";
      const uniqueFileName = `${base}_${crypto.randomUUID().slice(0, 8)}${ext}`;

      const filePath = `${userId}/${crypto.randomUUID()}_${sanitizeFileName(uniqueFileName)}`;

      const { error: uploadError } = await supabase.storage
        .from("expense_invoices")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      try {
        const { data, error: extractError } = await supabase.functions.invoke(
          "extract-data-from-expense-image",
          {
            body: { filePath },
          },
        );

        if (extractError) {
          let message = "Extraction failed";
          try {
            if (
              extractError &&
              typeof extractError === "object" &&
              "context" in extractError
            ) {
              const body = await (
                extractError as {
                  context: {
                    json: () => Promise<{
                      error?: string;
                      rejection_reason?: string;
                    }>;
                  };
                }
              ).context.json();
              message =
                body?.rejection_reason || body?.error || extractError.message;
            } else {
              message = extractError.message || message;
            }
          } catch {
            message = extractError.message || message;
          }
          throw new ExtractionExpenseError(message);
        }

        if (!data?.success) {
          throw new ExtractionExpenseError(
            data?.rejection_reason || data?.error || "Extraction failed",
          );
        }

        return {
          id: crypto.randomUUID(),
          fileName: uniqueFileName,
          filePath,
          expense_date:
            data.expense_date || new Date().toISOString().split("T")[0],
          vendor_name: data.vendor_name || "Unbekannt",
          image_url: filePath,
          file_name: uniqueFileName,
          products: (data.products || []).map(
            (p: {
              product_name: string;
              amount: number;
              category: string;
            }) => ({
              id: crypto.randomUUID(),
              product_name: p.product_name || "Unbekannt",
              amount: typeof p.amount === "number" ? p.amount : 0,
              category: isExpenseCategory(p.category)
                ? p.category
                : DEFAULT_EXPENSE_CATEGORY,
            }),
          ),
        };
      } catch (err) {
        await deleteImageFromStorage(filePath);
        throw err;
      }
    },
  });
}

export function useDeclineExpenseUpload() {
  return useMutation<void, Error, string>({
    mutationFn: async (filePath: string) => {
      await deleteImageFromStorage(filePath);
    },
  });
}

export function useConfirmAndUploadToDatabase() {
  const queryClient = useQueryClient();

  return useMutation<ExpenseRecord, PostgrestError, ConfirmReceiptPayload & { user_id: string }>({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          user_id: payload.user_id,
          category: payload.category,
          amount: payload.amount,
          expense_date: payload.expense_date,
          vendor_name: payload.vendor_name,
          image_url: payload.image_url,
          file_name: payload.file_name,
          products: JSON.parse(JSON.stringify(payload.products)),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["availableYears"] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation<
    ExpenseRecord,
    PostgrestError,
    {
      id: string;
      category: ExpenseCategory;
      amount: number;
      expense_date: string;
      vendor_name: string;
      products: StoredProduct[];
    }
  >({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from("expenses")
        .update({
          category: payload.category,
          amount: payload.amount,
          expense_date: payload.expense_date,
          vendor_name: payload.vendor_name,
          products: JSON.parse(JSON.stringify(payload.products)),
        })
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["availableYears"] });
    },
  });
}

export function useRemoveExpense() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; imageUrl: string }>({
    mutationFn: async ({ id, imageUrl }) => {
      const { error: dbError } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id);
      if (dbError) throw dbError;

      if (imageUrl) {
        await deleteImageFromStorage(imageUrl);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["availableYears"] });
    },
  });
}
