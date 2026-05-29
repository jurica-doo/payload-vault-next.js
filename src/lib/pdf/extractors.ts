import { type ExtractedData } from "./types";
import { normalizeDate, normalizeSaldo } from "./utils";

export const extractedBarmeniaAbrechnung = (text: string): ExtractedData => {
  if (!text) return null;

  const date = text.match(/Maschinell am (\d{2}\.\d{2}\.\d{4})/)?.[1];
  const saldo = text.match(
    /Überweisung -([+-]?\d{1,3}(?:\.\d{3})*,\d{2})/,
  )?.[1];
  const category = text.toLowerCase().includes("abrechnung")
    ? "Barmenia Abrechnung"
    : undefined;

  if (!date || !saldo || !category) return null;

  const generalGrantMatch = text.match(
    /Allgemeiner Zuschuss[\s\S]*?(\d{1,3}(?:\.\d{3})*,\d{2})/,
  )?.[1];

  return {
    profit: normalizeSaldo(saldo),
    date_created: normalizeDate(date),
    category,
    ...(generalGrantMatch && {
      general_grant: normalizeSaldo(generalGrantMatch),
    }),
  };
};

export const extractedAdcuriAbschlussprovision = (
  text: string,
): ExtractedData => {
  if (!text) return null;

  const date = text.match(/Bochum (\d{1,2}\.\d{1,2}\.\d{4})/)?.[1];
  const saldo = text.match(/Auszahl\.: ([+-]?\d+,\d{2})/)?.[1];
  const category = text.toLowerCase().includes("abschlussprovision")
    ? "Adcuri Abschlussprovision"
    : undefined;

  if (!date || !saldo || !category) return null;

  return {
    profit: normalizeSaldo(saldo),
    date_created: normalizeDate(date),
    category,
  };
};

export const extractedAdcuriBestandsprovision = (
  text: string,
): ExtractedData => {
  if (!text) return null;

  const date = text.match(/Bochum (\d{1,2}\.\d{1,2}\.\d{4})/)?.[1];
  const saldo = text.match(/Auszahl\.: ([+-]?\d+,\d{2})/)?.[1];
  const lower = text.toLowerCase();
  const category =
    lower.includes("adcuri") && !lower.includes("abschlussprovision")
      ? "Adcuri Bestandsprovision"
      : undefined;

  if (!date || !saldo || !category) return null;

  return {
    profit: normalizeSaldo(saldo),
    date_created: normalizeDate(date),
    category,
  };
};

export const extractedStromUndGas = (text: string): ExtractedData => {
  if (!text) return null;

  const date = text.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/)?.[1];
  const saldo = text.match(/Summe Brutto ([+-]?\d+,\d{2})/)?.[1];
  const category = text.toLowerCase().includes("alpha energie")
    ? "Strom & Gas"
    : undefined;

  if (!date || !saldo || !category) return null;

  return {
    profit: normalizeSaldo(saldo),
    date_created: normalizeDate(date),
    category,
  };
};

export const extractedIKK = (text: string): ExtractedData => {
  if (!text) return null;

  const date = text.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/)?.[1];
  const saldo = text.match(/Gesamtbetrag ([+-]?\d+,\d{2})/)?.[1];
  const category = text.includes("IKK") ? "IKK Abrechnung" : undefined;

  if (!date || !saldo || !category) return null;

  return {
    profit: normalizeSaldo(saldo),
    date_created: normalizeDate(date),
    category,
  };
};

// Ordered by priority — first match wins
const EXTRACTORS: Array<(text: string) => ExtractedData> = [
  extractedIKK,
  extractedStromUndGas,
  extractedAdcuriBestandsprovision,
  extractedAdcuriAbschlussprovision,
  extractedBarmeniaAbrechnung,
];

export const unifiedPdfExtractor = (text: string): ExtractedData => {
  if (!text) return null;

  for (const extractor of EXTRACTORS) {
    try {
      const data = extractor(text);
      if (data?.date_created && data.profit != null) return data;
    } catch {
      // try next extractor
    }
  }

  return null;
};
