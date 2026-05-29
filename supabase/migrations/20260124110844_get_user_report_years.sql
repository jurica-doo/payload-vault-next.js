CREATE INDEX IF NOT EXISTS idx_pdf_records_user_date 
ON public.pdf_records (user_id, date_created);

CREATE OR REPLACE FUNCTION public.get_user_report_years()
RETURNS TABLE (year integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT EXTRACT(YEAR FROM date_created)::integer AS year
  FROM public.pdf_records
  WHERE user_id = auth.uid()
  ORDER BY year DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_report_years() TO authenticated;
