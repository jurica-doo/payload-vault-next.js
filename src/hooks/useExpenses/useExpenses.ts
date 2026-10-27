import { dbErrorMessage, GENERIC_ERROR, throwDbError, UserFacingError } from "../../utils/dbErrors";
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

export class DuplicateExpenseError extends UserFacingError {
  constructor(fileName: string) {
    super(`Eine Datei mit dem Namen „${fileName}“ existiert bereits.`);
    this.name = "DuplicateExpenseError";
  }
}

export { checkDuplicateExpenseContent };

export class ExtractionExpenseError extends UserFacingError {
  rejectionReason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "ExtractionExpenseError";
    this.rejectionReason = reason;
  }
}

const EXTRACTION_FAILED =
  "Der Beleg konnte nicht ausgelesen werden. Bitte versuchen Sie es erneut oder laden Sie ein schärferes Foto hoch.";

/** HTTP status → message when the edge function sent no usable key. */
const EXTRACTION_STATUS: Record<number, string> = {
  401: "unauthorized",
  403: "forbidden",
  413: "file_too_large",
  429: "rate_limited",
  400: "invalid_file_path",
  503: "ai_unavailable",
};

/**
 * German text for a failed extract-data-from-expense-image call: the AI's
 * own (German) rejection reason, else the error key, else the HTTP status.
 */
async function extractionErrorText(error: unknown): Promise<string> {
  const ctx = (error as { context?: { status?: number; json?: () => Promise<unknown> } })?.context;
  let body: { error?: string; code?: string; rejection_reason?: string } | undefined;
  try {
    body = (await ctx?.json?.()) as typeof body;
  } catch {
    // Non-JSON body (gateway error); fall through to status/network checks.
  }
  if (body?.rejection_reason) return body.rejection_reason;
  const key = body?.code ?? body?.error ?? (ctx?.status ? EXTRACTION_STATUS[ctx.status] : undefined);
  const text = dbErrorMessage(key ? { message: key } : error);
  return text === GENERIC_ERROR ? EXTRACTION_FAILED : text;
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

async function checkDuplicateExpenseContent(
  userId: string,
  expense: {
    expense_date: string;
    vendor_name: string;
    amount: number;
  },
): Promise<{ file_name: string; image_url: string } | null> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, amount, vendor_name, file_name, image_url")
    .eq("user_id", userId)
    .eq("expense_date", expense.expense_date)
    .limit(100);

  if (error) throwDbError(error);
  if (!data || data.length === 0) return null;

  const normalizedVendor = expense.vendor_name.trim().toLowerCase();

  const match = data.find((existing) => {
    const existingVendor = (existing.vendor_name ?? "").trim().toLowerCase();
    const amountMatch = Math.abs(existing.amount - expense.amount) < 0.01;
    const vendorMatch = existingVendor === normalizedVendor;
    return amountMatch && vendorMatch;
  });

  if (!match) return null;

  return { file_name: match.file_name, image_url: match.image_url };
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
      if (error) throwDbError(error);

      const filePaths = data.map((e) => e.image_url).filter(Boolean);
      if (filePaths.length === 0) return data;

      const { data: signedUrls, error: signedUrlsError } =
        await supabase.storage
          .from("expense_invoices")
          .createSignedUrls(filePaths, 900);

      if (signedUrlsError) throwDbError(signedUrlsError);

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
      const filePath = `${userId}/${crypto.randomUUID()}_${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("expense_invoices")
        .upload(filePath, file);
      if (uploadError) throwDbError(uploadError);

      try {
        const { data, error: extractError } = await supabase.functions.invoke(
          "extract-data-from-expense-image",
          {
            body: { filePath },
          },
        );

        if (extractError) {
          throw new ExtractionExpenseError(
            await extractionErrorText(extractError),
          );
        }

        if (!data?.success) {
          throw new ExtractionExpenseError(
            data?.rejection_reason ||
              (data?.error ? dbErrorMessage({ message: data.error }) : EXTRACTION_FAILED),
          );
        }

        return {
          id: crypto.randomUUID(),
          fileName: file.name,
          filePath,
          expense_date:
            data.expense_date || new Date().toISOString().split("T")[0],
          vendor_name: data.vendor_name || "Unbekannt",
          image_url: filePath,
          file_name: file.name,
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

  return useMutation<
    ExpenseRecord,
    PostgrestError,
    ConfirmReceiptPayload & { user_id: string }
  >({
    mutationFn: async (payload) => {
      const insertRow = (fileName: string) =>
        supabase
          .from("expenses")
          .insert({
            user_id: payload.user_id,
            category: payload.category,
            amount: payload.amount,
            expense_date: payload.expense_date,
            vendor_name: payload.vendor_name,
            image_url: payload.image_url,
            file_name: fileName,
            products: JSON.parse(JSON.stringify(payload.products)),
          })
          .select()
          .single();

      const isUniqueViolation = (e: PostgrestError) =>
        e.code === "23505" || e.message?.includes("unique");

      const { data, error } = await insertRow(payload.file_name);

      if (error && isUniqueViolation(error)) {
        const baseName = payload.file_name;
        const dotIdx = baseName.lastIndexOf(".");
        for (let i = 1; i <= 50; i++) {
          const uniqueName =
            dotIdx > 0
              ? `${baseName.slice(0, dotIdx)}_${i}${baseName.slice(dotIdx)}`
              : `${baseName}_${i}`;
          const { data: retryData, error: retryError } =
            await insertRow(uniqueName);
          if (!retryError) return retryData;
          if (!isUniqueViolation(retryError)) throwDbError(retryError);
        }
        throwDbError(error);
      }

      if (error) throwDbError(error);
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
      if (error) throwDbError(error);
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
      if (dbError) throwDbError(dbError);

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
