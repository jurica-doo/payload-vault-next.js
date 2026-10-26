-- ============================================================
-- r1/p2/subsidy: approved monthly subsidies (spec §2, §6.4)
-- ============================================================
-- The level's maximum subsidy is a ceiling, never a payment. Each month's
-- approved amount is recorded per person, with the ceiling in force at the
-- start of that month as a snapshot and the coverage basis as text.
--   * above the ceiling, for a level without a standard maximum (FA), or for
--     part-time employees (§2: maxima are for full-time) → only with an
--     explicit override reason
--   * one approved record per person and month; a change supersedes the
--     previous one (history kept)
--   * months already approved/paid can't change
-- Prorating, pausing, reclaiming (OD-09) are not automated: finance enters
-- the amount it decided.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subsidy_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  month               date NOT NULL CHECK (extract(day FROM month) = 1),
  max_amount_snapshot numeric(10, 2),
  approved_amount     numeric(10, 2) NOT NULL CHECK (approved_amount >= 0),
  status              text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'superseded', 'revoked')),
  coverage_note       text NOT NULL CHECK (length(btrim(coverage_note)) BETWEEN 3 AND 1000),
  override_reason     text,
  approved_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subsidy_within_ceiling CHECK (
    override_reason IS NOT NULL
    OR approved_amount = 0
    OR (max_amount_snapshot IS NOT NULL AND approved_amount <= max_amount_snapshot))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subsidy_one_approved
  ON public.subsidy_records (employee_id, month) WHERE status = 'approved';

SELECT app_private.attach_audit('public.subsidy_records');

ALTER TABLE public.subsidy_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subsidy_select ON public.subsidy_records;
CREATE POLICY subsidy_select ON public.subsidy_records FOR SELECT TO authenticated
  USING (app_private.can_see_commission_of(employee_id));

REVOKE ALL ON public.subsidy_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subsidy_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subsidy_records TO service_role;

CREATE OR REPLACE FUNCTION app_private.assert_month_open(p_month date)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.statement_periods
              WHERE period_month = p_month AND status IN ('approved', 'paid')) THEN
    RAISE EXCEPTION 'period_locked' USING ERRCODE = 'P0001';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_subsidy(
  p_employee_id     uuid,
  p_month           date,
  p_amount          numeric,
  p_coverage_note   text,
  p_reason          text,
  p_override_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month    date := date_trunc('month', p_month)::date;
  v_emp      public.employees%ROWTYPE;
  v_level    text;
  v_max      numeric;
  v_override text := nullif(btrim(coalesce(p_override_reason, '')), '');
  v_id       uuid;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  PERFORM app_private.require_reason(p_reason);
  PERFORM app_private.assert_month_open(v_month);
  PERFORM pg_advisory_xact_lock(hashtext('subsidy:' || p_employee_id::text || v_month::text));

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_month < date_trunc('month', v_emp.start_date)::date THEN
    RAISE EXCEPTION 'before_start_date' USING ERRCODE = 'P0001';
  END IF;

  v_level := app_private.level_at(p_employee_id, v_month);
  IF v_level IS NULL THEN RAISE EXCEPTION 'producer_without_level' USING ERRCODE = 'P0001'; END IF;
  SELECT l.max_subsidy INTO v_max FROM public.career_levels l
   WHERE l.rule_version_id = app_private.rule_version_at('levels', v_month) AND l.code = v_level;

  IF p_amount > 0 AND v_override IS NULL AND (
       v_max IS NULL OR p_amount > v_max OR v_emp.employment_type <> 'full_time') THEN
    RAISE EXCEPTION 'subsidy_above_maximum' USING ERRCODE = 'P0001',
      DETAIL = format('max %s, employment %s', coalesce(v_max::text, '–'), v_emp.employment_type);
  END IF;

  UPDATE public.subsidy_records SET status = 'superseded'
   WHERE employee_id = p_employee_id AND month = v_month AND status = 'approved';

  INSERT INTO public.subsidy_records
    (employee_id, month, max_amount_snapshot, approved_amount, coverage_note, override_reason, approved_by)
  VALUES (p_employee_id, v_month, v_max, round(p_amount, 2), btrim(p_coverage_note), v_override, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_subsidy(p_employee_id uuid, p_month date, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  PERFORM app_private.require_reason(p_reason);
  PERFORM app_private.assert_month_open(v_month);
  UPDATE public.subsidy_records SET status = 'revoked'
   WHERE employee_id = p_employee_id AND month = v_month AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

-- ------------------------------------------------------------
-- Statements include the subsidy as a separate line (§6.3)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_statement(p_month date, p_employee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp   uuid := coalesce(p_employee_id, app_private.current_employee_id());
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF v_emp IS NULL OR NOT app_private.can_see_commission_of(v_emp) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH e AS (
      SELECT l.*,
             CASE WHEN l.commission_type = 'personal' THEN 'personal'
                  WHEN l.relationship = 'direct' THEN 'direct'
                  ELSE 'indirect' END AS bucket
        FROM public.commission_ledger l
        JOIN public.statement_periods sp ON sp.id = l.statement_period_id
       WHERE l.recipient_id = v_emp AND sp.period_month = v_month
    ),
    b AS (
      SELECT k.bucket,
             coalesce(sum(e.gross_amount), 0) AS gross,
             coalesce(sum(e.reserve_amount), 0) AS reserve,
             coalesce(sum(e.net_after_reserve), 0) AS net,
             count(e.id) AS entries
        FROM (VALUES ('personal'), ('direct'), ('indirect')) k(bucket)
        LEFT JOIN e ON e.bucket = k.bucket
       GROUP BY k.bucket
    )
    SELECT jsonb_build_object(
      'employee_id', v_emp,
      'month', v_month,
      'period_status', coalesce((SELECT status FROM public.statement_periods WHERE period_month = v_month), 'open'),
      'buckets', (SELECT jsonb_object_agg(bucket, jsonb_build_object('gross', gross, 'reserve', reserve, 'net', net, 'entries', entries)) FROM b),
      'total', (SELECT jsonb_build_object('gross', sum(gross), 'reserve', sum(reserve), 'net', sum(net), 'entries', sum(entries)) FROM b),
      'subsidy', (SELECT jsonb_build_object('approved', s.approved_amount, 'max', s.max_amount_snapshot,
                                            'note', s.coverage_note, 'override', s.override_reason IS NOT NULL)
                    FROM public.subsidy_records s
                   WHERE s.employee_id = v_emp AND s.month = v_month AND s.status = 'approved'))
  );
END
$$;

DROP FUNCTION IF EXISTS public.rpc_statement_overview(date);
CREATE FUNCTION public.rpc_statement_overview(p_month date)
RETURNS TABLE (
  recipient_id   uuid,
  recipient_name text,
  employee_no    text,
  gross          numeric,
  reserve        numeric,
  net            numeric,
  entries        bigint,
  subsidy        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF NOT (app_private.has_role('finance') OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    WITH c AS (
      SELECT l.recipient_id AS id, sum(l.gross_amount) AS gross, sum(l.reserve_amount) AS reserve,
             sum(l.net_after_reserve) AS net, count(*) AS entries
        FROM public.commission_ledger l
        JOIN public.statement_periods sp ON sp.id = l.statement_period_id
       WHERE sp.period_month = v_month
       GROUP BY l.recipient_id
    ),
    s AS (
      SELECT employee_id AS id, approved_amount FROM public.subsidy_records
       WHERE month = v_month AND status = 'approved'
    )
    SELECT e.id, e.last_name || ', ' || e.first_name, e.employee_no,
           coalesce(c.gross, 0), coalesce(c.reserve, 0), coalesce(c.net, 0), coalesce(c.entries, 0), s.approved_amount
      FROM public.employees e
      LEFT JOIN c ON c.id = e.id
      LEFT JOIN s ON s.id = e.id
     WHERE c.id IS NOT NULL OR s.id IS NOT NULL
     ORDER BY e.last_name, e.first_name;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_set_subsidy(uuid, date, numeric, text, text, text), public.rpc_revoke_subsidy(uuid, date, text),
  public.rpc_statement_overview(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_subsidy(uuid, date, numeric, text, text, text), public.rpc_revoke_subsidy(uuid, date, text),
  public.rpc_statement_overview(date) TO authenticated;
