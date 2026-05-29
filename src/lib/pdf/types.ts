export interface InlineData {
  data: string; // base64 PDF
  mimeType: "application/pdf";
}

export type PdfTextItem = {
  str: string;
  transform?: number[];
};

export type ExtractedData = {
  date_created: string;
  profit: number;
  category?: string;
  general_grant?: number;
} | null;
