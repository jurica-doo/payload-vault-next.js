-- ============================================================
-- v_commission_ledger: security_invoker (Supabase linter 0010)
-- ============================================================
-- The view was created without security_invoker on purpose: a recipient
-- must keep seeing their own commission even after the producer has left
-- their structure, and production_records / employees RLS hides exactly
-- those rows. The owner's rights bridged that gap, but they also bypass RLS
-- on every table in the view, so the visibility rule depended on the
-- view's WHERE clause alone (linter: security_definer_view, level ERROR).
--
-- Now:
--   * the view runs with the caller's rights, so commission_ledger RLS
--     (app_private.can_see_commission_of) decides which rows appear, and
--     statement_periods is readable by every authenticated user anyway;
--   * the four looked-up fields come from app_private.commission_ledger_facts,
--     a SECURITY DEFINER helper in the non-exposed schema that re-checks the
--     same rule per entry, so calling it directly reveals nothing more than
--     the ledger itself.
-- Columns, names and types are unchanged; the frontend needs no change.
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.commission_ledger_facts(p_ledger_id uuid)
RETURNS TABLE (production_date date, category_code text, producer_name text, recipient_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pr.production_date,
         pr.category_code,
         pe.first_name || ' ' || pe.last_name,
         re.first_name || ' ' || re.last_name
    FROM public.commission_ledger l
    JOIN public.production_records pr ON pr.id = l.production_id
    JOIN public.employees pe ON pe.id = l.producer_id
    JOIN public.employees re ON re.id = l.recipient_id
   WHERE l.id = p_ledger_id
     AND app_private.can_see_commission_of(l.recipient_id)
$$;

REVOKE EXECUTE ON FUNCTION app_private.commission_ledger_facts(uuid) FROM PUBLIC, anon;
-- The view calls it as the querying user.
GRANT EXECUTE ON FUNCTION app_private.commission_ledger_facts(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_commission_ledger
WITH (security_invoker = true) AS
SELECT l.*,
       sp.period_month,
       sp.status AS period_status,
       f.production_date,
       f.category_code,
       f.producer_name,
       f.recipient_name
  FROM public.commission_ledger l
  JOIN public.statement_periods sp ON sp.id = l.statement_period_id
  CROSS JOIN LATERAL app_private.commission_ledger_facts(l.id) f;

REVOKE ALL ON public.v_commission_ledger FROM PUBLIC, anon;
GRANT SELECT ON public.v_commission_ledger TO authenticated;
