import type { ExpenseCategory } from "../useExpenses/types";

export type BudgetTarget = {
  id: string;
  user_id: string;
  year: number;
  category: ExpenseCategory;
  budget_amount: number;
  created_at: string;
  updated_at: string;
};

export type NewBudgetTarget = {
  user_id: string;
  year: number;
  category: ExpenseCategory;
  budget_amount: number;
};

export type IncomeGoal = {
  id: string;
  user_id: string;
  year: number;
  month: number | null;
  goal_amount: number;
  created_at: string;
  updated_at: string;
};

export type NewIncomeGoal = {
  user_id: string;
  year: number;
  month: number | null;
  goal_amount: number;
};

export type BudgetProgress = {
  category: ExpenseCategory;
  budget: number;
  spent: number;
  percentage: number;
  remaining: number;
};

export type IncomeProgress = {
  label: string;
  month: number | null;
  goal: number;
  current: number;
  percentage: number;
  remaining: number;
  goalId: string;
};
