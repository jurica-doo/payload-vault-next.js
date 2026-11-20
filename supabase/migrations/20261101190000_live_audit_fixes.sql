-- ============================================================
-- Fixes from the live audit (2026-11-20)
-- ============================================================
--  * Cockpit: the career tile gets the final Karriereplan conditions (own
--    business, retention rate, ready flag), so it no longer says "erreicht"
--    while a condition is still missing.
--  * rpc_create_task: a missing owner means the caller.
-- ============================================================

CREATE OR REPLACE FUNCTION app_rpc.rpc_dashboard_me(p_month date DEFAULT NULL)
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
      'window_start', v_career -> 'window' -> 'start',
      -- Final Karriereplan conditions (migration 20261101170000).
      'personal_points', v_career -> 'personal' -> 'points', 'own_required', v_career -> 'own_required',
      'own_ok', v_career -> 'own_ok', 'retention', v_career -> 'retention', 'is_ready', v_career -> 'is_ready'),
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

SELECT app_private.publish_rpc('app_rpc.rpc_dashboard_me(date)'::regprocedure);

CREATE OR REPLACE FUNCTION app_rpc.rpc_create_task(p_owner_id uuid, p_title text, p_description text DEFAULT NULL::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_priority text DEFAULT 'normal'::text, p_linked_type text DEFAULT NULL::text, p_linked_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := app_private.current_employee_id();
  v_id uuid;
BEGIN
  -- No owner = the caller (before, NULL skipped the permission check and failed as owner_inactive).
  p_owner_id := coalesce(p_owner_id, v_me);
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT (p_owner_id = v_me OR app_private.is_manager_of(p_owner_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN RAISE EXCEPTION 'title_too_short' USING ERRCODE = '22023'; END IF;
  IF length(btrim(p_title)) > 300 OR length(p_description) > 4000 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tasks (owner_id, created_by, title, description, due_at, priority, linked_type, linked_id)
  VALUES (p_owner_id, v_me, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_due_at, p_priority, p_linked_type, p_linked_id)
  RETURNING id INTO v_id;
  IF p_owner_id <> v_me THEN
    PERFORM app_private.notify(p_owner_id, 'manual', 'Neue Aufgabe: ' || btrim(p_title), NULL, '/vertrieb/aufgaben');
  END IF;
  RETURN v_id;
END
$$;

SELECT app_private.publish_rpc('app_rpc.rpc_create_task(uuid, text, text, timestamp with time zone, text, text, uuid)'::regprocedure);
