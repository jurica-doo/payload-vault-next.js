import type { jsPDF } from "jspdf";

export const PAGE_MARGIN = 15;
export const A4_WIDTH = 210;
export const A4_HEIGHT = 297;
export const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2;
export const CONTENT_TOP = PAGE_MARGIN + 10;
export const SAFE_BOTTOM = A4_HEIGHT - PAGE_MARGIN - 12;

export const LOGO_WIDTH_MM = 28;
export const LOGO_HEIGHT_MM = 14;

export const COLORS = {
  title: "#1a1a1a",
  sectionHeader: "#333333",
  text: "#444444",
  subtle: "#888888",
  tableHeader: "#f0f0f0",
  tableHeaderText: "#333333",
  altRow: "#fafafa",
  primary: "#00c4b3",
  error: "#f43f5e",
  border: "#e0e0e0",
} as const;

export type LogoAsset = {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
};

export async function loadLogoAsset(): Promise<LogoAsset | null> {
  try {
    const res = await fetch("/profinaLogo.svg");
    if (!res.ok) return null;
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("logo load failed"));
        img.src = url;
      });
      const baseW = img.width || 200;
      const baseH = img.height || 100;
      const scale = 4;
      const canvas = document.createElement("canvas");
      canvas.width = baseW * scale;
      canvas.height = baseH * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return {
        dataUrl: canvas.toDataURL("image/png"),
        widthMm: LOGO_WIDTH_MM,
        heightMm: LOGO_HEIGHT_MM,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

export function sanitizeEmailForFilename(email: string): string {
  const local = email.split("@")[0] ?? "benutzer";
  const cleaned = local.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return cleaned || "benutzer";
}

export function formatCurrency(value: number): string {
  return (
    value.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " \u20AC"
  );
}

export function addSectionTitle(
  doc: jsPDF,
  title: string,
  y: number,
): number {
  if (y > SAFE_BOTTOM - 20) {
    doc.addPage();
    y = CONTENT_TOP;
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLORS.sectionHeader);
  doc.text(title, PAGE_MARGIN, y);

  doc.setDrawColor(COLORS.primary);
  doc.setLineWidth(0.6);
  doc.line(PAGE_MARGIN, y + 1.5, PAGE_MARGIN + 18, y + 1.5);

  return y + 8;
}

export function addPageDecorations(
  doc: jsPDF,
  year: number,
  logo: LogoAsset | null,
): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    if (logo) {
      const x = A4_WIDTH - PAGE_MARGIN - logo.widthMm;
      const y = 6;
      doc.addImage(logo.dataUrl, "PNG", x, y, logo.widthMm, logo.heightMm);
    }

    doc.setDrawColor(COLORS.primary);
    doc.setLineWidth(0.8);
    doc.line(
      PAGE_MARGIN,
      A4_HEIGHT - PAGE_MARGIN - 2,
      A4_WIDTH - PAGE_MARGIN,
      A4_HEIGHT - PAGE_MARGIN - 2,
    );

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.sectionHeader);
    doc.text(
      "Profina Payload Vault",
      PAGE_MARGIN,
      A4_HEIGHT - PAGE_MARGIN + 3,
    );

    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.subtle);
    doc.text(
      `Steuerbericht ${year}`,
      A4_WIDTH / 2,
      A4_HEIGHT - PAGE_MARGIN + 3,
      { align: "center" },
    );
    doc.text(
      `Seite ${i} von ${totalPages}`,
      A4_WIDTH - PAGE_MARGIN,
      A4_HEIGHT - PAGE_MARGIN + 3,
      { align: "right" },
    );
  }
}

export function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > SAFE_BOTTOM) {
    doc.addPage();
    return CONTENT_TOP;
  }
  return y;
}

export const TABLE_MARGIN = {
  left: PAGE_MARGIN,
  right: PAGE_MARGIN,
  top: CONTENT_TOP,
  bottom: PAGE_MARGIN + 10,
} as const;
