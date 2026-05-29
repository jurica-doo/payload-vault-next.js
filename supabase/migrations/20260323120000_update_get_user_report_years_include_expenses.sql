CREATE INDEX IF NOT EXISTS idx_expenses_user_date
ON public.expenses (user_id, expense_date);

CREATE OR REPLACE FUNCTION public.get_user_report_years()
RETURNS TABLE (year integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT year FROM (
    SELECT EXTRACT(YEAR FROM date_created)::integer AS year
    FROM public.pdf_records
    WHERE user_id = auth.uid()

    UNION

    SELECT EXTRACT(YEAR FROM expense_date)::integer AS year
    FROM public.expenses
    WHERE user_id = auth.uid()
  ) combined
  ORDER BY year DESC;
$$;
