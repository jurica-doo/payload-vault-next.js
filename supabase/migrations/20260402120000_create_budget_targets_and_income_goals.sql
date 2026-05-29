-- ============================================================
-- Budget Targets: per-category budget goals for expenses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  category public.expense_category NOT NULL,
  budget_amount NUMERIC(12, 2) NOT NULL CHECK (budget_amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_budget_per_user_year_category UNIQUE (user_id, year, category)
);

ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budget targets"
  ON public.budget_targets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budget targets"
  ON public.budget_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budget targets"
  ON public.budget_targets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own budget targets"
  ON public.budget_targets FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_budget_targets_user_year
  ON public.budget_targets (user_id, year);

-- ============================================================
-- Income Goals: annual/monthly income targets
-- ============================================================
CREATE TABLE IF NOT EXISTS public.income_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER CHECK (month IS NULL OR (month >= 1 AND month <= 12)),
  goal_amount NUMERIC(12, 2) NOT NULL CHECK (goal_amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_income_goal_per_user_year_month UNIQUE (user_id, year, month)
);

-- For annual goals (month IS NULL), we need a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_goals_annual
  ON public.income_goals (user_id, year) WHERE month IS NULL;

ALTER TABLE public.income_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own income goals"
  ON public.income_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own income goals"
  ON public.income_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own income goals"
  ON public.income_goals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own income goals"
  ON public.income_goals FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_income_goals_user_year
  ON public.income_goals (user_id, year);
