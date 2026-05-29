export const normalizeDate = (dateStr: string): string => {
  const [day, month, year] = dateStr.split(".");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

export const normalizeSaldo = (saldo?: string): number => {
  return Number(saldo?.replace(/\./g, "").replace(",", ".") ?? "0");
};
