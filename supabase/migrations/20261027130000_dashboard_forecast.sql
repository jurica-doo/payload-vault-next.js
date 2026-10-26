-- ============================================================
-- r1/p3/forecast: dashboard returns the career counting window start
-- ============================================================
-- The career forecast (src/domain/forecast.ts) projects linearly from the
-- start of the counting window, which can be later than the period start
-- after a promotion. Same function as in 20261027110000, plus window_start.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_dashboard_me(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_month date := date_trunc('month', coalesce(p_month, app_private.business_today()))::date;
  v_next  date := (v_month + interval '1 month')::date;
  v_year  date := date_trunc('year', v_month)::date;
  m       record;
  y       record;
  v_trend jsonb;
  v_career jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO m FROM app_private.production_totals(v_me, v_month, v_next);
  SELECT * INTO y FROM app_private.production_totals(v_me, v_year, v_next);

  SELECT jsonb_agg(jsonb_build_object('month', s.mon, 'points', t.points) ORDER BY s.mon)
    INTO v_trend
    FROM (SELECT (v_month - (i || ' months')::interval)::date AS mon FROM generate_series(0, 5) i) s
    CROSS JOIN LATERAL app_private.production_totals(v_me, s.mon, (s.mon + interval '1 month')::date) t;

  PERFORM app_private.generate_periods(v_me);
  v_career := app_private.compute_qualification(v_me, app_private.business_today());

  RETURN jsonb_build_object(
    'month', v_month,
    'as_of', app_private.business_today(),
    'production', jsonb_build_object('points', m.points, 'kv_points', m.kv_points, 'ae', m.ae),
    'year', jsonb_build_object('points', y.points, 'kv_points', y.kv_points, 'ae', y.ae),
    'trend', v_trend,
    'goal', app_private.goal_snapshot(v_me, v_month),
    'career', jsonb_build_object(
      'status', v_career ->> 'status', 'reason', v_career ->> 'reason', 'level', v_career ->> 'level',
      'target', v_career ->> 'target', 'eligible', v_career -> 'eligible', 'required', v_career -> 'required',
      'eligible_kv', v_career -> 'eligible_kv', 'kv_required', v_career -> 'kv_required',
      'expected_now', v_career -> 'expected_now', 'period_end', v_career -> 'period' -> 'end',
      'window_start', v_career -> 'window' -> 'start'),
    'commission', (SELECT jsonb_build_object('gross', coalesce(sum(l.gross_amount), 0), 'net', coalesce(sum(l.net_after_reserve), 0))
                     FROM public.commission_ledger l
                     JOIN public.statement_periods sp ON sp.id = l.statement_period_id
                    WHERE l.recipient_id = v_me AND sp.period_month = v_month),
    'todo', jsonb_build_object(
      'drafts', (SELECT count(*) FROM public.production_records WHERE producer_id = v_me AND status = 'draft'),
      'goal_missing', NOT EXISTS (SELECT 1 FROM public.monthly_goals WHERE employee_id = v_me AND month = v_month),
      'goals_to_review', (SELECT count(*) FROM public.monthly_goals g
                           WHERE g.status = 'submitted' AND g.employee_id <> v_me
                             AND g.employee_id IN (SELECT d.descendant_id FROM app_private.descendants_at(v_me, app_private.business_today()) d))));
END
$$;
