import type { ExpenseRecord, StoredProduct } from "../../hooks/useExpenses/types";
import type { PdfRecord } from "../../hooks/usePdf/types";
import type {
  AllExpensePdfTypes,
  AllPdfTypes,
  SingleExpensePdf,
  SinglePdf,
} from "./types";

const formatAllPdfs = (allPdfs: PdfRecord[]) => {
  let totalIncome = 0;
  let totalPdf = 0;
  const pdfs: SinglePdf[] = [];

  allPdfs.forEach((pdf) => {
    totalIncome += pdf.profit;
    totalPdf++;
    const singlePdf: SinglePdf = {
      id: pdf.id,
      category: pdf.category,
      date: pdf.date_created,
      signedUrl: pdf.signed_url || "",
      openLink: pdf.signed_url || "",
      income: pdf.profit,
      title: pdf.file_name,
    };
    pdfs.push(singlePdf);
  });

  const allData: AllPdfTypes = {
    totalPdf,
    totalIncome,
    pdfs,
  };

  return allData;
};

const formatAllPdfsExpenses = (
  allPdfs: ExpenseRecord[],
  activeCategory?: string,
) => {
  let totalIncome = 0;
  let totalPdf = 0;
  const pdfs: SingleExpensePdf[] = [];

  allPdfs.forEach((pdf) => {
    const products = Array.isArray(pdf.products)
      ? (pdf.products as StoredProduct[])
      : [];

    let displayAmount: number;
    if (activeCategory && products.length > 0) {
      displayAmount = products
        .filter((p) => p.category === activeCategory)
        .reduce((sum, p) => sum + p.amount, 0);
    } else {
      displayAmount = pdf.amount;
    }

    totalIncome += displayAmount;
    totalPdf++;

    const singlePdf: SingleExpensePdf = {
      id: pdf.id,
      category: pdf.category,
      created_at: pdf.created_at,
      expense_date: pdf.expense_date,
      file_name: pdf.file_name,
      image_url: pdf.image_url,
      signed_url: pdf.signed_url || "",
      user_id: pdf.user_id,
      vendor_name: pdf.vendor_name || "Unbekannt",
      amount: displayAmount,
      products,
    };
    pdfs.push(singlePdf);
  });

  const allData: AllExpensePdfTypes = {
    totalPdf,
    totalIncome,
    pdfs,
  };

  return allData;
};

export { formatAllPdfs, formatAllPdfsExpenses };
