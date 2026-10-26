-- ============================================================
-- r1/p2/statements: statement workflow, statements, export log
-- ============================================================
-- Spec §6.2 (statuses), §6.3 (separate views), §12.2/§12.4 (exports
-- recorded), §14.2–14.3.
--
-- Month workflow (finance/admin + MFA, every change audited with a reason):
--   open → reviewed → approved → paid
--   reviewed → open    (reopen for corrections; reason required)
--   approved and paid are final: later corrections are booked in the next
--   open month (ledger slice), so an approved statement never changes.
-- A month can't be approved before it has ended (Berlin time).
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_set_statement_status(p_month date, p_status text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month  date := date_trunc('month', p_month)::date;
  v_old    text;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  PERFORM app_private.require_reason(p_reason);

  INSERT INTO public.statement_periods (period_month) VALUES (v_month) ON CONFLICT (period_month) DO NOTHING;
  SELECT status INTO v_old FROM public.statement_periods WHERE period_month = v_month FOR UPDATE;

  IF NOT (
       (v_old = 'open' AND p_status = 'reviewed')
    OR (v_old = 'reviewed' AND p_status IN ('open', 'approved'))
    OR (v_old = 'approved' AND p_status = 'paid')
  ) THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = 'P0001', DETAIL = format('%s → %s', v_old, p_status);
  END IF;

  IF p_status = 'approved' AND (v_month + interval '1 month')::date > app_private.business_today() THEN
    RAISE EXCEPTION 'month_not_ended' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.statement_periods
     SET status = p_status, status_changed_at = now(), status_changed_by = auth.uid()
   WHERE period_month = v_month;
END
$$;

-- One person's statement for a month (§6.3: own production, direct and
-- indirect differential shown separately; never labelled as take-home pay).
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
      'total', (SELECT jsonb_build_object('gross', sum(gross), 'reserve', sum(reserve), 'net', sum(net), 'entries', sum(entries)) FROM b))
  );
END
$$;

-- Finance overview: every recipient with entries in a month.
CREATE OR REPLACE FUNCTION public.rpc_statement_overview(p_month date)
RETURNS TABLE (
  recipient_id   uuid,
  recipient_name text,
  employee_no    text,
  gross          numeric,
  reserve        numeric,
  net            numeric,
  entries        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('finance') OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT l.recipient_id, e.last_name || ', ' || e.first_name, e.employee_no,
           sum(l.gross_amount), sum(l.reserve_amount), sum(l.net_after_reserve), count(*)
      FROM public.commission_ledger l
      JOIN public.statement_periods sp ON sp.id = l.statement_period_id
      JOIN public.employees e ON e.id = l.recipient_id
     WHERE sp.period_month = date_trunc('month', p_month)::date
     GROUP BY l.recipient_id, e.last_name, e.first_name, e.employee_no
     ORDER BY e.last_name, e.first_name;
END
$$;

-- Exports of sensitive data are recorded (§12.4). The browser builds the
-- file; this call is made right before the download.
CREATE OR REPLACE FUNCTION public.rpc_log_export(p_kind text, p_scope jsonb, p_row_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_kind NOT IN ('statement_overview', 'statement', 'ledger') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  IF p_kind <> 'statement' AND NOT (app_private.has_role('finance') OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM app_private.log_event('export.' || p_kind, 'export', coalesce(p_scope ->> 'month', '-'),
                                jsonb_build_object('scope', p_scope, 'rows', p_row_count));
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_set_statement_status(date, text, text), public.rpc_statement(date, uuid),
  public.rpc_statement_overview(date), public.rpc_log_export(text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_statement_status(date, text, text), public.rpc_statement(date, uuid),
  public.rpc_statement_overview(date), public.rpc_log_export(text, jsonb, integer) TO authenticated;
