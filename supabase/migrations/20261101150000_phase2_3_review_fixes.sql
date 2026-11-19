-- ============================================================
-- Phase 2/3 review fixes (commission, statements, subsidy, goals,
-- dashboards, coaching) — requirements1/phase-2-commission/verification,
-- requirements1/phase-3-cockpit/verification
-- ============================================================
-- P3-TEAM-01   rpc_dashboard_team: a direct report whose career periods were
--              never generated (nobody opened their career page, cron not
--              running) showed "blocked" instead of their qualification.
-- P3-GOAL-01   v_goals.can_review: finance/compliance/admin see every goal
--              (RLS), so the "Zur Freigabe" list offered "Freigeben" for goals
--              the caller may not review (→ forbidden). The view now says who
--              may decide (today's managers, admins with an employee record,
--              never the employee).
-- P3-GOAL-02   rpc_submit_goal / rpc_review_goal: comments are immutable
--              (versions, reviews) and were unbounded → 4,000 chars.
-- P3-COACH-01  coaching texts: participants were unbounded; length violations
--              now raise text_too_long instead of a bare CHECK error; a bad
--              action owner / note visibility raises invalid_input (the
--              previous key invalid_payload reads as an import error).
-- P3-COACH-02  rpc_performance_profile returns can_coach, so the UI shows the
--              coaching forms only to today's managers (an admin who is also a
--              leader saw them for people outside their structure).
-- P2-EXPORT-01 rpc_log_export: finance-scope exports (every recipient's
--              commission) need a 2FA-confirmed session (§12.2 "protect
--              exports/downloads"); the own statement export does not.
-- P2-SUBSIDY-01 rpc_set_subsidy: no subsidy for inactive employees
--              (owner_inactive); override reason ≤ 500, coverage note ≤ 1,000
--              with named errors.
-- P2-TASK-01   §11.2 "Subsidy review due": at the start of a month, every
--              active employee who had an approved subsidy (> 0) last month
--              and no decision for this month yet becomes a system task for
--              every active finance user (type subsidy_review, due on the
--              10th). Closed automatically once a record exists or the month
--              is locked.
-- ============================================================

-- ------------------------------------------------------------
-- P3-TEAM-01 — team dashboard generates periods before qualifying
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_dashboard_team(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_today date := app_private.business_today();
  v_month date := date_trunc('month', coalesce(p_month, v_today))::date;
  v_next  date := (v_month + interval '1 month')::date;
  v_rows  jsonb;
  t       record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  -- Periods are created lazily; a direct report who never opened their own
  -- pages would otherwise show "blocked / no_period".
  PERFORM app_private.generate_periods(d.descendant_id)
     FROM app_private.descendants_at(v_me, v_today) d
    WHERE d.depth = 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'employee_id', e.id,
           'name', e.first_name || ' ' || e.last_name,
           'status', e.status,
           'level', app_private.level_at(e.id, v_today),
           'own', (SELECT to_jsonb(p) FROM app_private.production_totals(e.id, v_month, v_next) p),
           'structure', (SELECT to_jsonb(s) FROM app_private.structure_totals(e.id, v_month, v_next) s),
           'team_size', (SELECT count(*) FROM app_private.descendants_at(e.id, v_today)),
           'goal', app_private.goal_snapshot(e.id, v_month),
           'career_status', (app_private.compute_qualification(e.id, v_today) ->> 'status'))
         ORDER BY e.last_name, e.first_name), '[]'::jsonb)
    INTO v_rows
    FROM app_private.descendants_at(v_me, v_today) d
    JOIN public.employees e ON e.id = d.descendant_id
   WHERE d.depth = 1;

  SELECT * INTO t FROM app_private.structure_totals(v_me, v_month, v_next);

  RETURN jsonb_build_object(
    'month', v_month,
    'direct_reports', v_rows,
    'structure_total', jsonb_build_object('points', t.points, 'kv_points', t.kv_points, 'ae', t.ae),
    'team_size', (SELECT count(*) FROM app_private.descendants_at(v_me, v_today)));
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_dashboard_team(date)'::regprocedure);

-- ------------------------------------------------------------
-- P3-GOAL-01 — who may decide a goal
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_goals
WITH (security_invoker = true) AS
SELECT g.*,
       e.first_name || ' ' || e.last_name AS employee_name,
       app_private.goal_reviewer(g.employee_id) AS reviewer_id,
       (SELECT v.targets FROM public.monthly_goal_versions v WHERE v.goal_id = g.id AND v.version = g.current_version) AS submitted_targets,
       (SELECT r.comment FROM public.goal_reviews r WHERE r.goal_id = g.id ORDER BY r.created_at DESC LIMIT 1) AS last_review_comment,
       (g.employee_id IS DISTINCT FROM app_private.current_employee_id()
        AND (app_private.is_manager_of(g.employee_id)
             OR (app_private.has_role('admin') AND app_private.current_employee_id() IS NOT NULL))) AS can_review
  FROM public.monthly_goals g
  JOIN public.employees e ON e.id = g.employee_id;

REVOKE ALL ON public.v_goals FROM PUBLIC, anon;
GRANT SELECT ON public.v_goals TO authenticated;

-- ------------------------------------------------------------
-- P3-GOAL-02 — bounded, immutable comments
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_submit_goal(p_goal_id uuid, p_comment text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g public.monthly_goals%ROWTYPE;
BEGIN
  IF length(coalesce(p_comment, '')) > 4000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM public.monthly_goals WHERE id = p_goal_id FOR UPDATE;
  IF NOT FOUND OR g.employee_id IS DISTINCT FROM app_private.current_employee_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM app_private.assert_goal_month_open(g.month);
  IF g.status <> 'draft' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  IF g.draft = '{}'::jsonb THEN RAISE EXCEPTION 'goal_empty' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.monthly_goal_versions (goal_id, version, targets, employee_comment, submitted_by)
  VALUES (g.id, g.current_version + 1, g.draft, nullif(btrim(coalesce(p_comment, '')), ''), auth.uid());

  UPDATE public.monthly_goals
     SET status = 'submitted', current_version = g.current_version + 1,
         late = g.late OR app_private.business_today() > g.month
   WHERE id = g.id;
  RETURN g.current_version + 1;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_submit_goal(uuid, text)'::regprocedure);

CREATE OR REPLACE FUNCTION app_rpc.rpc_review_goal(p_goal_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g    public.monthly_goals%ROWTYPE;
  v_me uuid := app_private.current_employee_id();
BEGIN
  IF length(coalesce(p_comment, '')) > 4000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM public.monthly_goals WHERE id = p_goal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_decision NOT IN ('approved', 'returned') THEN RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023'; END IF;
  IF g.employee_id = v_me THEN RAISE EXCEPTION 'cannot_review_own' USING ERRCODE = 'P0001'; END IF;
  IF NOT (
       app_private.has_role('admin')
    OR (v_me IS NOT NULL AND v_me IN (SELECT a.ancestor_id FROM app_private.ancestors_at(g.employee_id, app_private.business_today()) a))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF g.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  IF v_me IS NULL THEN RAISE EXCEPTION 'reviewer_not_employee' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.goal_reviews (goal_id, version, reviewer_id, decision, comment)
  VALUES (g.id, g.current_version, v_me, p_decision, nullif(btrim(coalesce(p_comment, '')), ''));
  UPDATE public.monthly_goals SET status = p_decision WHERE id = g.id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_review_goal(uuid, text, text)'::regprocedure);

-- ------------------------------------------------------------
-- P3-COACH-01 — bounded texts, named errors
-- ------------------------------------------------------------
ALTER TABLE public.coaching_sessions DROP CONSTRAINT IF EXISTS coaching_participants_length;
ALTER TABLE public.coaching_sessions
  ADD CONSTRAINT coaching_participants_length CHECK (participants IS NULL OR length(participants) <= 500);

CREATE OR REPLACE FUNCTION app_rpc.rpc_add_coaching_session(
  p_employee_id    uuid,
  p_held_on        date,
  p_summary        text,
  p_participants   text DEFAULT NULL,
  p_next_review_on date DEFAULT NULL,
  p_actions        jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me  uuid := app_private.current_employee_id();
  v_id  uuid;
  a     jsonb;
BEGIN
  IF NOT app_private.is_manager_of(p_employee_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_held_on IS NULL THEN RAISE EXCEPTION 'date_required' USING ERRCODE = '22023'; END IF;
  IF p_held_on > app_private.business_today() THEN RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001'; END IF;
  IF length(btrim(coalesce(p_summary, ''))) < 3 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF length(p_summary) > 4000 OR length(coalesce(p_participants, '')) > 500 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_next_review_on IS NOT NULL AND p_next_review_on < p_held_on THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.coaching_sessions (employee_id, leader_id, held_on, participants, summary, next_review_on)
  VALUES (p_employee_id, v_me, p_held_on, nullif(btrim(coalesce(p_participants, '')), ''), btrim(p_summary), p_next_review_on)
  RETURNING id INTO v_id;

  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) LOOP
    IF jsonb_typeof(a) <> 'object' OR a ->> 'owner' NOT IN ('employee', 'leader') THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(a ->> 'title', ''))) < 3 THEN RAISE EXCEPTION 'title_too_short' USING ERRCODE = '22023'; END IF;
    IF length(a ->> 'title') > 300 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.coaching_actions (session_id, employee_id, owner_id, title, due_on, created_by)
    VALUES (v_id, p_employee_id, CASE a ->> 'owner' WHEN 'employee' THEN p_employee_id ELSE v_me END,
            btrim(a ->> 'title'), nullif(a ->> 'due_on', '')::date, auth.uid());
  END LOOP;
  RETURN v_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_add_coaching_session(uuid, date, text, text, date, jsonb)'::regprocedure);

CREATE OR REPLACE FUNCTION app_rpc.rpc_add_coaching_note(p_employee_id uuid, p_visibility text, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_private.is_manager_of(p_employee_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_visibility NOT IN ('private_manager', 'shared') THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body, ''))) < 1 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF length(p_body) > 4000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.coaching_notes (employee_id, author_id, visibility, body)
  VALUES (p_employee_id, app_private.current_employee_id(), p_visibility, btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_add_coaching_note(uuid, text, text)'::regprocedure);

-- ------------------------------------------------------------
-- P3-COACH-02 — the profile says whether the caller may coach
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_performance_profile(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today   date := app_private.business_today();
  v_month   date := date_trunc('month', v_today)::date;
  v_trend   jsonb;
  v_mix     jsonb;
  v_goals   jsonb;
  v_career  jsonb;
  v_recent  numeric;
  v_before  numeric;
  v_month_p numeric;
  v_target  numeric;
  v_overdue integer;
  v_prompts jsonb := '[]'::jsonb;
  v_coach   boolean := app_private.can_see_coaching(p_employee_id);
  v_manager boolean := app_private.is_manager_of(p_employee_id);
BEGIN
  IF NOT (p_employee_id = app_private.current_employee_id() OR v_manager OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('month', s.mon, 'points', t.points, 'kv', t.kv_points) ORDER BY s.mon)
    INTO v_trend
    FROM (SELECT (v_month - (i || ' months')::interval)::date AS mon FROM generate_series(0, 11) i) s
    CROSS JOIN LATERAL app_private.production_totals(p_employee_id, s.mon, (s.mon + interval '1 month')::date) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('category', category_code, 'contracts', n, 'points', pts) ORDER BY pts DESC), '[]')
    INTO v_mix
    FROM (SELECT pr.category_code, count(DISTINCT pr.id) FILTER (WHERE pr.status = 'eligible') AS n, coalesce(sum(pc.points), 0) AS pts
            FROM public.production_records pr
            LEFT JOIN public.point_calculations pc ON pc.production_id = pr.id
           WHERE pr.producer_id = p_employee_id AND pr.production_date >= (v_month - interval '11 months')::date
             AND pr.status IN ('eligible', 'cancelled')
           GROUP BY pr.category_code) m;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'month', g.month, 'status', g.status,
           'target', (app_private.goal_snapshot(p_employee_id, g.month) -> 'targets' ->> 'points')::numeric,
           'actual', (SELECT t.points FROM app_private.production_totals(p_employee_id, g.month, (g.month + interval '1 month')::date) t))
         ORDER BY g.month DESC), '[]')
    INTO v_goals
    FROM (SELECT * FROM public.monthly_goals WHERE employee_id = p_employee_id AND month <= v_month ORDER BY month DESC LIMIT 6) g;

  PERFORM app_private.generate_periods(p_employee_id);
  v_career := app_private.compute_qualification(p_employee_id, v_today);

  -- Prompts (§8.3): worded for a conversation, never as a verdict.
  IF (v_career ->> 'kv_missing')::numeric > 0 AND (v_career ->> 'points_missing')::numeric = 0 THEN
    v_prompts := v_prompts || jsonb_build_object('code', 'kv_gap', 'value', v_career -> 'kv_missing');
  END IF;

  SELECT avg((x ->> 'points')::numeric) INTO v_recent FROM jsonb_array_elements(v_trend) WITH ORDINALITY AS t(x, n) WHERE n BETWEEN 9 AND 11;
  SELECT avg((x ->> 'points')::numeric) INTO v_before FROM jsonb_array_elements(v_trend) WITH ORDINALITY AS t(x, n) WHERE n BETWEEN 6 AND 8;
  IF v_before > 0 AND v_recent < v_before * 0.8 THEN
    v_prompts := v_prompts || jsonb_build_object('code', 'declining_trend', 'recent', round(v_recent, 2), 'before', round(v_before, 2));
  END IF;

  SELECT t.points INTO v_month_p FROM app_private.production_totals(p_employee_id, v_month, (v_month + interval '1 month')::date) t;
  v_target := (app_private.goal_snapshot(p_employee_id, v_month) -> 'targets' ->> 'points')::numeric;
  IF v_target > 0 AND v_month_p < v_target * (extract(day FROM v_today) / extract(day FROM (v_month + interval '1 month - 1 day'))) * 0.8 THEN
    v_prompts := v_prompts || jsonb_build_object('code', 'behind_goal', 'actual', v_month_p, 'target', v_target);
  END IF;

  IF v_coach THEN
    SELECT count(*) INTO v_overdue FROM public.coaching_actions
     WHERE employee_id = p_employee_id AND status = 'open' AND due_on < v_today;
    IF v_overdue > 0 THEN
      v_prompts := v_prompts || jsonb_build_object('code', 'overdue_actions', 'count', v_overdue);
    END IF;
  END IF;

  RETURN (SELECT jsonb_build_object(
    'employee', jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name, 'status', e.status,
                                   'start_date', e.start_date, 'level', app_private.level_at(e.id, v_today)),
    'trend', v_trend,
    'product_mix', v_mix,
    'goals', v_goals,
    'career', v_career,
    'prompts', v_prompts,
    'can_coach', v_manager,
    'next_review_on', CASE WHEN v_coach THEN (SELECT min(next_review_on) FROM public.coaching_sessions
                                               WHERE employee_id = e.id AND next_review_on >= v_today) END)
    FROM public.employees e WHERE e.id = p_employee_id);
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_performance_profile(uuid)'::regprocedure);

-- ------------------------------------------------------------
-- P2-EXPORT-01 — finance-scope exports need a 2FA-confirmed session
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_log_export(p_kind text, p_scope jsonb, p_row_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_kind NOT IN ('statement_overview', 'statement', 'ledger') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  IF p_kind <> 'statement' THEN
    -- Every recipient's commission: finance/admin with MFA (§12.2).
    PERFORM app_private.assert_finance_or_admin();
  END IF;
  IF jsonb_typeof(coalesce(p_scope, '{}'::jsonb)) <> 'object' OR length(p_scope::text) > 2000 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.log_event('export.' || p_kind, 'export', coalesce(p_scope ->> 'month', '-'),
                                jsonb_build_object('scope', p_scope, 'rows', greatest(coalesce(p_row_count, 0), 0)));
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_log_export(text, jsonb, integer)'::regprocedure);

-- ------------------------------------------------------------
-- P2-SUBSIDY-01 — active employees only, bounded texts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_set_subsidy(
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
  v_note     text := btrim(coalesce(p_coverage_note, ''));
  v_id       uuid;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  PERFORM app_private.require_reason(p_reason);
  IF p_month IS NULL THEN RAISE EXCEPTION 'date_required' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF length(v_note) < 3 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF length(v_note) > 1000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  IF length(coalesce(v_override, '')) > 500 THEN RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.assert_month_open(v_month);
  PERFORM pg_advisory_xact_lock(hashtext('subsidy:' || p_employee_id::text || v_month::text));

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_emp.status <> 'active' THEN RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001'; END IF;
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
  VALUES (p_employee_id, v_month, v_max, round(p_amount, 2), v_note, v_override, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_set_subsidy(uuid, date, numeric, text, text, text)'::regprocedure);

-- ------------------------------------------------------------
-- P2-TASK-01 — "Subsidy review due" (§11.2)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.run_subsidy_review_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := app_private.business_today();
  v_month date := date_trunc('month', v_today)::date;
  v_prev  date := (v_month - interval '1 month')::date;
  v_keep  uuid[] := '{}';
  v_id    uuid;
  v_n     integer := 0;
  r       record;
BEGIN
  -- Tasks of earlier months are stale (their title names the month).
  UPDATE public.tasks
     SET status = 'cancelled', completed_at = now(), completion_note = 'Monat gewechselt'
   WHERE type = 'subsidy_review' AND source = 'system' AND status = 'open' AND due_at < v_month::timestamptz;

  IF NOT EXISTS (SELECT 1 FROM public.statement_periods
                  WHERE period_month = v_month AND status IN ('approved', 'paid')) THEN
    FOR r IN
      SELECT s.employee_id, e.first_name || ' ' || e.last_name AS name, s.approved_amount, f.id AS finance_id
        FROM public.subsidy_records s
        JOIN public.employees e ON e.id = s.employee_id AND e.status = 'active'
        CROSS JOIN (SELECT fe.id FROM public.employees fe
                      JOIN public.user_roles ur ON ur.user_id = fe.user_id AND ur.role = 'finance' AND ur.revoked_at IS NULL
                     WHERE fe.status = 'active') f
       WHERE s.month = v_prev AND s.status = 'approved' AND s.approved_amount > 0
         AND NOT EXISTS (SELECT 1 FROM public.subsidy_records x
                          WHERE x.employee_id = s.employee_id AND x.month = v_month AND x.status = 'approved')
    LOOP
      v_id := app_private.ensure_system_task('subsidy_review', r.finance_id,
                format('Zuschuss prüfen: %s (%s, Vormonat %s €)', r.name, to_char(v_month, 'MM.YYYY'),
                       replace(to_char(r.approved_amount, 'FM999999990.00'), '.', ',')),
                (v_month + 9)::timestamptz, 'employee', r.employee_id, 'normal', '/vertrieb/provisionen/abrechnung');
      v_keep := v_keep || v_id;
      v_n := v_n + 1;
    END LOOP;
  END IF;

  PERFORM app_private.close_system_tasks('subsidy_review', v_keep, 'Zuschuss für den Monat entschieden');
  RETURN jsonb_build_object('subsidy_review_open', v_n);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.run_subsidy_review_tasks() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auto      integer;
  v_leads     jsonb;
  v_customers jsonb;
  v_core      jsonb;
  v_subsidy   jsonb;
  v_sent      integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS notify_digest (
    recipient_id uuid NOT NULL, kind text NOT NULL, n integer NOT NULL, title text NOT NULL,
    body text, link text, critical boolean NOT NULL, PRIMARY KEY (recipient_id, kind)
  ) ON COMMIT DROP;
  PERFORM set_config('app.notify_digest', 'on', true);
  v_auto      := app_private.auto_assign_pool_leads();
  v_leads     := app_private.run_lead_task_generators();
  v_customers := app_private.run_customer_task_generators();
  v_core      := app_private.run_core_task_generators();
  v_subsidy   := app_private.run_subsidy_review_tasks();
  PERFORM set_config('app.notify_digest', 'off', true);
  v_sent := app_private.flush_notification_digest();
  RETURN v_core || v_leads || v_customers || v_subsidy || jsonb_build_object('auto_assigned', v_auto, 'notifications', v_sent);
END
$$;

NOTIFY pgrst, 'reload schema';
