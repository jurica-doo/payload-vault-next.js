import type { Category } from "../../data/Categories";

type AllPdfs = {
  title: string;
  subtitle: string;
  link: string;
};

type CategoryData = {
  category: Category;
  subtitle: number;
  profit: number;
};

type FullData = {
  totalIncome: number;
  totalPdf: number;
  allCategories: CategoryData[];
  allPdfs: AllPdfs;
};

export type { CategoryData, FullData };
