import type { PdfRecord } from "../../hooks/usePdf/types";
import type { CategoryData } from "../home/types";

export const formatAdcuriData = (pdfs: PdfRecord[]) => {
  let totalIncome = 0;
  let totalPdf = 0;
  const allData: CategoryData[] = [
    {
      category: {
        slug: "adcuri/abschlussprovision",
        title: "Adcuri Abschlussprovision",
      },
      profit: 0,
      subtitle: 0,
    },
    {
      category: {
        slug: "adcuri/bestandsprovision",
        title: "Adcuri Bestandsprovision",
      },
      profit: 0,
      subtitle: 0,
    },
  ];

  pdfs.forEach((pdf) => {
    if (pdf.category.split(" ")[0] !== "Adcuri") return;
    totalIncome += pdf.profit;
    totalPdf++;
    allData.forEach((data) => {
      if (pdf.category === data.category.title) {
        data.profit += pdf.profit;
        data.subtitle++;
      }
    });
  });

  const fullData = {
    totalIncome,
    totalPdf,
    adcuriCategories: allData,
  };

  return fullData;
};
