-- ============================================================
-- RLS: evaluate auth.uid() once per statement (Supabase linter 0003)
-- ============================================================
-- A bare auth.uid() in a policy is re-evaluated for every row. Wrapped in
-- (SELECT ...) Postgres runs it once as an InitPlan and reuses the value.
-- The result set is identical (the value is fixed for the statement), see
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- ALTER POLICY keeps each policy's name, command and roles; only the
-- expressions change. app_private.has_role('admin') in user_roles_select does
-- not depend on the row either, so it gets the same treatment.
-- ============================================================

-- pdf_records
ALTER POLICY "Users can view own records" ON public.pdf_records
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can insert own records" ON public.pdf_records
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can update own records" ON public.pdf_records
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can delete own records" ON public.pdf_records
  USING ((SELECT auth.uid()) = user_id);

-- expenses
ALTER POLICY "Users can view own expenses" ON public.expenses
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can insert own expenses" ON public.expenses
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can update own expenses" ON public.expenses
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can delete own expenses" ON public.expenses
  USING ((SELECT auth.uid()) = user_id);

-- budget_targets
ALTER POLICY "Users can view own budget targets" ON public.budget_targets
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can insert own budget targets" ON public.budget_targets
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can update own budget targets" ON public.budget_targets
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can delete own budget targets" ON public.budget_targets
  USING ((SELECT auth.uid()) = user_id);

-- income_goals
ALTER POLICY "Users can view own income goals" ON public.income_goals
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can insert own income goals" ON public.income_goals
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can update own income goals" ON public.income_goals
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can delete own income goals" ON public.income_goals
  USING ((SELECT auth.uid()) = user_id);

-- user_roles
ALTER POLICY user_roles_select ON public.user_roles
  USING (user_id = (SELECT auth.uid()) OR (SELECT app_private.has_role('admin')));
