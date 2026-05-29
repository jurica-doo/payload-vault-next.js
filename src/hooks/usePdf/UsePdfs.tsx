import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import type { FetchPdfProps, PdfRecord, NewPdf } from "./types";
import type { PendingUpload, PdfCategory } from "./usePendingUpload";
import { processSalesData, unifiedPdfExtractor } from "../../lib/pdf";

async function deleteFileFromStorage(path: string) {
  const { error } = await supabase.storage.from("pdf_reports").remove([path]);
  if (error) console.error("Error removing file from bucket:", error);
}

async function fetchPdfs({
  userId,
  category,
  year,
  startMonth,
  endMonth,
  sortBy = "new",
}: FetchPdfProps): Promise<PdfRecord[]> {
  let query = supabase.from("pdf_records").select("*").eq("user_id", userId);

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (year) {
    const start = `${year}-${String(startMonth ?? 1).padStart(2, "0")}-01`;
    const end = endMonth
      ? endMonth === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(endMonth + 1).padStart(2, "0")}-01`
      : `${year + 1}-01-01`;
    query = query.gte("date_created", start).lt("date_created", end);
  }

  switch (sortBy) {
    case "old":
      query = query.order("date_created", { ascending: true });
      break;
    case "high":
      query = query.order("profit", { ascending: false });
      break;
    case "low":
      query = query.order("profit", { ascending: true });
      break;
    default:
      query = query.order("date_created", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  const filePaths = data
    .map((pdf) => pdf.pdf_url)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  if (filePaths.length === 0)
    return data.map((pdf) => ({ ...pdf, signed_url: "" }));

  const { data: signedUrls, error: signError } = await supabase.storage
    .from("pdf_reports")
    .createSignedUrls(filePaths, 900);

  if (signError) throw signError;
  return data.map((pdf, index) => ({
    ...pdf,
    signed_url: signedUrls?.[index]?.signedUrl ?? "",
  }));
}

async function insertPdf(pdf: NewPdf): Promise<PdfRecord> {
  const { data, error } = await supabase
    .from("pdf_records")
    .insert(pdf)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deletePdfAndFile(id: string): Promise<PdfRecord> {
  const { data: record, error: fetchError } = await supabase
    .from("pdf_records")
    .select("pdf_url")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;
  if (record?.pdf_url) await deleteFileFromStorage(record.pdf_url);

  const { data, error } = await supabase
    .from("pdf_records")
    .delete()
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly rejectionReason?: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export class DuplicateFileError extends Error {
  constructor(fileName: string) {
    super(`Eine Datei mit dem Namen "${fileName}" existiert bereits.`);
    this.name = "DuplicateFileError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function checkDuplicateFileName(
  userId: string,
  fileName: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("pdf_records")
    .select("id")
    .eq("user_id", userId)
    .eq("file_name", fileName)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function validateCategory(cat: string): PdfCategory {
  const valid: PdfCategory[] = [
    "Strom & Gas",
    "Barmenia Abrechnung",
    "IKK Abrechnung",
    "Adcuri Abschlussprovision",
    "Adcuri Bestandsprovision",
  ];
  return valid.includes(cat as PdfCategory)
    ? (cat as PdfCategory)
    : "Strom & Gas";
}

function buildStoragePath(userId: string, fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  const ext = lastDot > 0 ? fileName.slice(lastDot + 1) : "pdf";
  const safeName = `${crypto.randomUUID()}_${fileName.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
  return `${userId}/${safeName}`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" — strip the prefix
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Core extraction (local, no Gemini/edge function) ─────────────────────────

type ExtractVariables = { file: File; userId: string };
type UploadVariables = { file: File; userId: string };

async function extractLocally(file: File) {
  const base64 = await fileToBase64(file);
  const text = await processSalesData({
    data: base64,
    mimeType: "application/pdf",
  });
  const extracted = unifiedPdfExtractor(text);

  if (!extracted) {
    throw new ExtractionError(
      "Dokument nicht erkannt",
      "Dieses Dokument konnte nicht als gültige Rechnung identifiziert werden.",
    );
  }

  return {
    category: validateCategory(extracted.category ?? ""),
    profit: extracted.profit,
    dateCreated: extracted.date_created,
    general_grant: extracted.general_grant,
  };
}

// Extract only — upload to storage only after successful extraction
async function uploadAndExtractOnly({
  file,
  userId,
}: ExtractVariables): Promise<PendingUpload> {
  const isDuplicate = await checkDuplicateFileName(userId, file.name);
  if (isDuplicate) throw new DuplicateFileError(file.name);

  // Extract first — don't waste a storage upload on a bad file
  const extractedData = await extractLocally(file);

  const filePath = buildStoragePath(userId, file.name);
  const { error: uploadError } = await supabase.storage
    .from("pdf_reports")
    .upload(filePath, file);

  if (uploadError)
    throw new ExtractionError("Upload fehlgeschlagen", uploadError.message);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    filePath,
    extractedData,
  };
}

// Legacy: extract + immediately insert (used by uploadPdf mutation)
async function uploadAndInsertPdf({
  file,
  userId,
}: UploadVariables): Promise<PdfRecord> {
  const isDuplicate = await checkDuplicateFileName(userId, file.name);
  if (isDuplicate) throw new DuplicateFileError(file.name);

  const extractedData = await extractLocally(file);

  const filePath = buildStoragePath(userId, file.name);
  const { error: uploadError } = await supabase.storage
    .from("pdf_reports")
    .upload(filePath, file);

  if (uploadError)
    throw new ExtractionError("Upload fehlgeschlagen", uploadError.message);

  return insertPdf({
    user_id: userId,
    file_name: file.name,
    pdf_url: filePath,
    category: extractedData.category,
    profit: extractedData.profit,
    date_created: extractedData.dateCreated,
    ...(extractedData.general_grant != null && {
      general_grant: extractedData.general_grant,
    }),
  });
}

// ── Confirm / decline pending uploads ────────────────────────────────────────

type ConfirmVariables = { userId: string; pendingUpload: PendingUpload };

async function confirmPendingUpload({
  userId,
  pendingUpload,
}: ConfirmVariables): Promise<PdfRecord> {
  return insertPdf({
    user_id: userId,
    file_name: pendingUpload.fileName,
    pdf_url: pendingUpload.filePath,
    category: pendingUpload.extractedData.category,
    profit: pendingUpload.extractedData.profit,
    date_created: pendingUpload.extractedData.dateCreated,
    ...(pendingUpload.extractedData.general_grant != null && {
      general_grant: pendingUpload.extractedData.general_grant,
    }),
  });
}

async function declinePendingUpload(filePath: string): Promise<void> {
  await deleteFileFromStorage(filePath);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePdfs(props: FetchPdfProps) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pdfs"] });
    queryClient.invalidateQueries({ queryKey: ["availableYears"] });
  };

  const query = useQuery<PdfRecord[], PostgrestError>({
    queryKey: ["pdfs", props],
    queryFn: () => fetchPdfs(props),
    enabled: !!props.userId,
    staleTime: 1000 * 60 * 50,
  });

  const addPdf = useMutation<PdfRecord, PostgrestError, NewPdf>({
    mutationFn: insertPdf,
    onSuccess: invalidate,
  });

  const uploadPdf = useMutation<PdfRecord, Error, UploadVariables>({
    mutationFn: uploadAndInsertPdf,
    onSuccess: invalidate,
  });

  const updatePdf = useMutation<
    PdfRecord,
    PostgrestError,
    { id: string; category: PdfCategory; profit: number; date_created: string }
  >({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from("pdf_records")
        .update({
          category: payload.category,
          profit: payload.profit,
          date_created: payload.date_created,
        })
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const removePdf = useMutation<PdfRecord, PostgrestError, string>({
    mutationFn: deletePdfAndFile,
    onSuccess: invalidate,
  });

  const extractPdf = useMutation<PendingUpload, Error, ExtractVariables>({
    mutationFn: uploadAndExtractOnly,
  });

  const confirmPdf = useMutation<PdfRecord, PostgrestError, ConfirmVariables>({
    mutationFn: confirmPendingUpload,
    onSuccess: invalidate,
  });

  const declinePdf = useMutation<void, Error, string>({
    mutationFn: declinePendingUpload,
  });

  return {
    ...query,
    uploadPdf,
    addPdf,
    updatePdf,
    removePdf,
    extractPdf,
    confirmPdf,
    declinePdf,
  };
}
