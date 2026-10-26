-- ============================================================
-- r1/p3/dashboards: role dashboards (spec §7.3, §14.5)
-- ============================================================
-- One RPC per dashboard so each page needs a single round trip. All
-- production figures come from the points ledger (eligible calculations incl.
-- reversals) by production date, so cancellations disappear everywhere at
-- once and nothing is counted twice (§14.5). Activity figures (appointments,
-- offers, follow-ups) arrive with Phase 4.
-- ============================================================

-- Ledger totals for one producer in [from, to).
CREATE OR REPLACE FUNCTION app_private.production_totals(p_employee uuid, p_from date, p_to date)
RETURNS TABLE (points numeric, kv_points numeric, ae numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(pc.points), 0), coalesce(sum(pc.kv_points), 0), coalesce(sum(pc.ae), 0)
    FROM public.production_records pr
    JOIN public.point_calculations pc ON pc.production_id = pr.id
   WHERE pr.producer_id = p_employee AND pr.production_date >= p_from AND pr.production_date < p_to
$$;

-- Ledger totals for a whole structure (all descendants today) in [from, to).
CREATE OR REPLACE FUNCTION app_private.structure_totals(p_leader uuid, p_from date, p_to date)
RETURNS TABLE (points numeric, kv_points numeric, ae numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(pc.points), 0), coalesce(sum(pc.kv_points), 0), coalesce(sum(pc.ae), 0)
    FROM app_private.descendants_at(p_leader, app_private.business_today()) d
    JOIN public.production_records pr ON pr.producer_id = d.descendant_id
    JOIN public.point_calculations pc ON pc.production_id = pr.id
   WHERE pr.production_date >= p_from AND pr.production_date < p_to
$$;

CREATE OR REPLACE FUNCTION app_private.goal_snapshot(p_employee uuid, p_month date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'status', g.status,
           'targets', coalesce((SELECT v.targets FROM public.monthly_goal_versions v
                                 WHERE v.goal_id = g.id AND v.version = g.current_version), g.draft))
    FROM public.monthly_goals g
   WHERE g.employee_id = p_employee AND g.month = p_month
$$;

-- ------------------------------------------------------------
-- Employee dashboard
-- ------------------------------------------------------------
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
      'expected_now', v_career -> 'expected_now', 'period_end', v_career -> 'period' -> 'end'),
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

-- ------------------------------------------------------------
-- Team dashboard (direct reports, each with their own structure)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_dashboard_team(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_month date := date_trunc('month', coalesce(p_month, app_private.business_today()))::date;
  v_next  date := (v_month + interval '1 month')::date;
  v_rows  jsonb;
  t       record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'employee_id', e.id,
           'name', e.first_name || ' ' || e.last_name,
           'status', e.status,
           'level', app_private.level_at(e.id, app_private.business_today()),
           'own', (SELECT to_jsonb(p) FROM app_private.production_totals(e.id, v_month, v_next) p),
           'structure', (SELECT to_jsonb(s) FROM app_private.structure_totals(e.id, v_month, v_next) s),
           'team_size', (SELECT count(*) FROM app_private.descendants_at(e.id, app_private.business_today())),
           'goal', app_private.goal_snapshot(e.id, v_month),
           'career_status', (app_private.compute_qualification(e.id, app_private.business_today()) ->> 'status'))
         ORDER BY e.last_name, e.first_name), '[]'::jsonb)
    INTO v_rows
    FROM app_private.descendants_at(v_me, app_private.business_today()) d
    JOIN public.employees e ON e.id = d.descendant_id
   WHERE d.depth = 1;

  SELECT * INTO t FROM app_private.structure_totals(v_me, v_month, v_next);

  RETURN jsonb_build_object(
    'month', v_month,
    'direct_reports', v_rows,
    'structure_total', jsonb_build_object('points', t.points, 'kv_points', t.kv_points, 'ae', t.ae),
    'team_size', (SELECT count(*) FROM app_private.descendants_at(v_me, app_private.business_today())));
END
$$;

-- ------------------------------------------------------------
-- Admin dashboard: data quality and queues
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_dashboard_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := app_private.business_today();
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('finance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'without_level', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name) ORDER BY e.last_name), '[]')
                        FROM public.employees e
                       WHERE e.status = 'active' AND app_private.level_at(e.id, v_today) IS NULL),
    'without_assignment', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name) ORDER BY e.last_name), '[]')
                             FROM public.employees e
                            WHERE e.status = 'active'
                              AND NOT EXISTS (SELECT 1 FROM public.hierarchy_assignments a
                                               WHERE a.employee_id = e.id AND a.effective_from <= v_today
                                                 AND (a.effective_to IS NULL OR a.effective_to > v_today))),
    'expired_invites', (SELECT count(*) FROM public.employees e
                         WHERE e.status = 'invited'
                           AND NOT EXISTS (SELECT 1 FROM public.employee_invites i
                                            WHERE i.employee_id = e.id AND i.accepted_at IS NULL
                                              AND i.revoked_at IS NULL AND i.expires_at > now())),
    'production_to_confirm', (SELECT count(*) FROM public.production_records WHERE status = 'submitted'),
    'open_exceptions', (SELECT count(*) FROM public.exception_queue WHERE status = 'open'),
    'goals_to_review', (SELECT count(*) FROM public.monthly_goals WHERE status = 'submitted'),
    'unapproved_past_months', (SELECT coalesce(jsonb_agg(sp.period_month ORDER BY sp.period_month), '[]')
                                 FROM public.statement_periods sp
                                WHERE sp.period_month < date_trunc('month', v_today)::date AND sp.status IN ('open', 'reviewed')));
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_dashboard_me(date), public.rpc_dashboard_team(date), public.rpc_dashboard_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_me(date), public.rpc_dashboard_team(date), public.rpc_dashboard_admin() TO authenticated;
