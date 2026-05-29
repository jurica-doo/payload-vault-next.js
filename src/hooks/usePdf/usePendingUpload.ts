import type { Database } from "../../types/supabase";

export type PdfCategory = Database["public"]["Enums"]["document_category"];

export type PendingUpload = {
  id: string;
  fileName: string;
  filePath: string;
  extractedData: {
    category: PdfCategory;
    profit: number;
    dateCreated: string;
     general_grant?: number;
  };
};

export type PendingUploadAction =
  | {
      type: "approve";
      id: string;
      data?: Partial<PendingUpload["extractedData"]>;
    }
  | { type: "decline"; id: string }
  | { type: "approveAll" }
  | { type: "declineAll" }
  | {
      type: "updateField";
      id: string;
      field: keyof PendingUpload["extractedData"];
      value: string | number;
    };
