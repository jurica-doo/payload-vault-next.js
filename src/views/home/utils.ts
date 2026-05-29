import type { HomeSort, PdfRecord } from "../../hooks/usePdf/types";
import type { CategoryData, FullData } from "./types";

const formatData = (allPdfs: PdfRecord[]) => {
  let totalIncome = 0;
  let totalPdf = 0;
  const allData: CategoryData[] = [
    {
      category: { slug: "adcuri", title: "Adcuri" },
      profit: 0,
      subtitle: 0,
    },
    {
      category: { slug: "barmenia-abrechnung", title: "Barmenia Abrechnung" },
      profit: 0,
      subtitle: 0,
    },
    {
      category: { slug: "ikk-abrechnung", title: "IKK Abrechnung" },
      profit: 0,
      subtitle: 0,
    },
    {
      category: { slug: "strom-gas", title: "Strom & Gas" },
      profit: 0,
      subtitle: 0,
    },
  ];
  allPdfs.forEach((pdf) => {
    totalIncome += pdf.profit;
    totalPdf++;
    allData.forEach((data) => {
      if (pdf.category === data.category.title) {
        data.profit += pdf.profit;
        data.subtitle++;
      }

      if (
        (pdf.category === "Adcuri Abschlussprovision" ||
          pdf.category === "Adcuri Bestandsprovision") &&
        data.category.title === "Adcuri"
      ) {
        data.profit += pdf.profit;
        data.subtitle++;
      }
    });
  });

  const fullData = {
    totalIncome,
    totalPdf,
    allCategories: allData,
    allPdfs: {
      title: "Alle Dokumente",
      subtitle: "Alle Dokumente durchsuchen · " + allPdfs.length,
      link: "/alle-dokumente",
    },
  };

  return fullData;
};

const sortData = (fullData: FullData, sort: HomeSort) => {
  const sortedCategories = [...fullData.allCategories];

  switch (sort) {
    case "high":
      sortedCategories.sort((a, b) => b.profit - a.profit);
      break;
    case "low":
      sortedCategories.sort((a, b) => a.profit - b.profit);
      break;
    case "most":
      sortedCategories.sort((a, b) => b.subtitle - a.subtitle);
      break;
    case "least":
      sortedCategories.sort((a, b) => a.subtitle - b.subtitle);
      break;
    default:
      break;
  }

  return {
    ...fullData,
    allCategories: sortedCategories,
  };
};

export { formatData, sortData };
