-- ============================================================
-- Second review sweep (2026-11-19): goals, coaching, dashboards, hardening
-- requirements1/phase-3-cockpit/verification, phase-2-commission/verification
-- ============================================================
-- P3-GOAL-03   late flag: re-evaluated on every submission, so an on-time
--              goal returned by the manager and resubmitted after the 1st
--              became "verspätet". Now only the first submission decides.
-- P3-GOAL-04   v_goals exposes the employee's submission comment and the last
--              decision, so reviewers read the employee's note (§7.2) and the
--              employee sees the decision also after an approval.
-- P3-GOAL-05   an admin deciding a goal outside their own structure is an
--              admin write → 2FA required (mfa_required), like every other
--              admin write; v_goals.can_review follows the same rule.
-- P3-COACH-03  an employee may complete or reopen their own agreed action,
--              but not cancel it (agreed with the leader); managers may.
-- P3-COACH-04  coaching_review reminders: a planned review that passed without
--              a conversation stays open (overdue) instead of being cancelled
--              "Termin liegt nicht mehr im Zeitfenster"; the latest session per
--              person decides the planned date.
-- P3-TEAM-02   team_size counts active people only (invited/deactivated people
--              inflated "n Personen").
-- SEC-01       views and vault tables: authenticated/anon lose INSERT/UPDATE/
--              DELETE/TRUNCATE/REFERENCES/TRIGGER (Supabase default ACL);
--              writes go through rpc_* only. Default ACL: new functions in
--              public are not executable by anon/PUBLIC/authenticated unless
--              granted explicitly (publish_rpc does).
-- SEC-02       statement_periods readable by employees and finance/admin only
--              (vault-only accounts saw every month's status and the actor).
-- SEC-03       rpc_log_export('statement') needs an employee record and
--              records the caller as the scope (no arbitrary export events).
-- ============================================================

-- ------------------------------------------------------------
-- P3-GOAL-03 — late flag from the first submission only
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
         -- "late" = the first submission came after the 1st; a resubmission
         -- after a return doesn't change it.
         late = CASE WHEN g.current_version = 0 THEN app_private.business_today() > g.month ELSE g.late END
   WHERE id = g.id;
  RETURN g.current_version + 1;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_submit_goal(uuid, text)'::regprocedure);

-- ------------------------------------------------------------
-- P3-GOAL-05 — admin decisions need 2FA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_review_goal(p_goal_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g         public.monthly_goals%ROWTYPE;
  v_me      uuid := app_private.current_employee_id();
  v_manager boolean;
BEGIN
  IF length(coalesce(p_comment, '')) > 4000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM public.monthly_goals WHERE id = p_goal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_decision NOT IN ('approved', 'returned') THEN RAISE EXCEPTION 'invalid_decision' USING ERRCODE = '22023'; END IF;
  IF g.employee_id = v_me THEN RAISE EXCEPTION 'cannot_review_own' USING ERRCODE = 'P0001'; END IF;
  v_manager := v_me IS NOT NULL
           AND v_me IN (SELECT a.ancestor_id FROM app_private.ancestors_at(g.employee_id, app_private.business_today()) a);
  IF NOT v_manager THEN
    -- Outside the own structure only an admin may decide, and that is an
    -- admin write: 2FA like every other admin action.
    IF NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF v_me IS NULL THEN RAISE EXCEPTION 'reviewer_not_employee' USING ERRCODE = 'P0001'; END IF;
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  END IF;
  IF g.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.goal_reviews (goal_id, version, reviewer_id, decision, comment)
  VALUES (g.id, g.current_version, v_me, p_decision, nullif(btrim(coalesce(p_comment, '')), ''));
  UPDATE public.monthly_goals SET status = p_decision WHERE id = g.id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_review_goal(uuid, text, text)'::regprocedure);

-- ------------------------------------------------------------
-- P3-GOAL-04 — the employee's note and the last decision in the view
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_goals;
CREATE VIEW public.v_goals
WITH (security_invoker = true) AS
SELECT g.*,
       e.first_name || ' ' || e.last_name AS employee_name,
       app_private.goal_reviewer(g.employee_id) AS reviewer_id,
       (SELECT v.targets FROM public.monthly_goal_versions v WHERE v.goal_id = g.id AND v.version = g.current_version) AS submitted_targets,
       (SELECT v.employee_comment FROM public.monthly_goal_versions v WHERE v.goal_id = g.id AND v.version = g.current_version) AS employee_comment,
       (SELECT r.comment FROM public.goal_reviews r WHERE r.goal_id = g.id ORDER BY r.created_at DESC LIMIT 1) AS last_review_comment,
       (SELECT r.decision FROM public.goal_reviews r WHERE r.goal_id = g.id ORDER BY r.created_at DESC LIMIT 1) AS last_review_decision,
       (SELECT r.created_at FROM public.goal_reviews r WHERE r.goal_id = g.id ORDER BY r.created_at DESC LIMIT 1) AS last_reviewed_at,
       (g.employee_id IS DISTINCT FROM app_private.current_employee_id()
        AND (app_private.is_manager_of(g.employee_id)
             OR (app_private.has_role('admin') AND app_private.current_employee_id() IS NOT NULL AND app_private.is_aal2()))) AS can_review
  FROM public.monthly_goals g
  JOIN public.employees e ON e.id = g.employee_id;

REVOKE ALL ON public.v_goals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_goals TO authenticated;

-- ------------------------------------------------------------
-- P3-COACH-03 — the owner can't cancel an agreed action
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_set_coaching_action_status(p_action_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  x         public.coaching_actions%ROWTYPE;
  v_manager boolean;
BEGIN
  SELECT * INTO x FROM public.coaching_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  v_manager := app_private.is_manager_of(x.employee_id);
  IF NOT (x.owner_id = app_private.current_employee_id() OR v_manager) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'done', 'cancelled') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023'; END IF;
  IF p_status = 'cancelled' AND NOT v_manager THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.coaching_actions
     SET status = p_status, done_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END
   WHERE id = p_action_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_set_coaching_action_status(uuid, text)'::regprocedure);

-- ------------------------------------------------------------
-- P3-TEAM-02 — team size = active people
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
           'team_size', (SELECT count(*) FROM app_private.descendants_at(e.id, v_today) x
                           JOIN public.employees xe ON xe.id = x.descendant_id AND xe.status = 'active'),
           'goal', app_private.goal_snapshot(e.id, v_month),
           'career_status', (app_private.compute_qualification(e.id, v_today) ->> 'status'))
         ORDER BY e.last_name, e.first_name), '[]'::jsonb)
    INTO v_rows
    FROM app_private.descendants_at(v_me, v_today) d
    JOIN public.employees e ON e.id = d.descendant_id
   WHERE d.depth = 1 AND e.status = 'active';

  SELECT * INTO t FROM app_private.structure_totals(v_me, v_month, v_next);

  RETURN jsonb_build_object(
    'month', v_month,
    'direct_reports', v_rows,
    'structure_total', jsonb_build_object('points', t.points, 'kv_points', t.kv_points, 'ae', t.ae),
    'team_size', (SELECT count(*) FROM app_private.descendants_at(v_me, v_today) x
                    JOIN public.employees xe ON xe.id = x.descendant_id AND xe.status = 'active'));
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_dashboard_team(date)'::regprocedure);

-- ------------------------------------------------------------
-- P3-COACH-04 — coaching_review stays open until the conversation happened
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.run_core_task_generators()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_today date := app_private.business_today();
  v_keep  uuid[];
  v_id    uuid;
  r       record;
  q       jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_mgr   uuid;
BEGIN
  PERFORM app_private.set_audit_context('Automatische Aufgabenerstellung');

  -- reassignment: open tasks of inactive owners move to the nearest active manager
  FOR r IN SELECT t.id, t.owner_id FROM public.tasks t JOIN public.employees e ON e.id = t.owner_id
            WHERE t.status = 'open' AND e.status = 'inactive' LOOP
    v_mgr := app_private.active_manager_of(r.owner_id);
    IF v_mgr IS NOT NULL THEN
      UPDATE public.tasks SET owner_id = v_mgr WHERE id = r.id
        AND NOT EXISTS (SELECT 1 FROM public.tasks x WHERE x.status = 'open' AND x.source = 'system'
                          AND x.type = tasks.type AND x.linked_id = tasks.linked_id AND x.owner_id = v_mgr);
      PERFORM app_private.notify(v_mgr, 'reassignment', 'Aufgabe übernommen', 'Die zuständige Person ist inaktiv.', '/vertrieb/aufgaben');
    END IF;
  END LOOP;

  -- goal_review
  v_keep := '{}';
  FOR r IN SELECT g.id, g.employee_id, e.first_name || ' ' || e.last_name AS name
             FROM public.monthly_goals g JOIN public.employees e ON e.id = g.employee_id
            WHERE g.status = 'submitted' LOOP
    v_mgr := app_private.active_manager_of(r.employee_id);
    CONTINUE WHEN v_mgr IS NULL;
    v_id := app_private.ensure_system_task('goal_review', v_mgr, 'Ziel prüfen: ' || r.name,
              (v_today + 3)::timestamptz, 'monthly_goal', r.id, 'normal', '/vertrieb/ziele');
    v_keep := v_keep || v_id;
  END LOOP;
  v_stats := v_stats || jsonb_build_object('goal_review_closed', app_private.close_system_tasks('goal_review', v_keep, 'Ziel wurde bearbeitet'));

  -- coaching_action (overdue)
  v_keep := '{}';
  FOR r IN SELECT a.id, a.owner_id, a.title, a.due_on FROM public.coaching_actions a
            WHERE a.status = 'open' AND a.due_on < v_today LOOP
    v_id := app_private.ensure_system_task('coaching_action', r.owner_id, 'Überfällige Maßnahme: ' || r.title,
              r.due_on::timestamptz, 'coaching_action', r.id, 'high', '/vertrieb');
    v_keep := v_keep || v_id;
  END LOOP;
  PERFORM app_private.close_system_tasks('coaching_action', v_keep, 'Maßnahme erledigt oder abgebrochen');

  -- coaching_review: the latest conversation per (active) person names the
  -- next review. Within 7 days it becomes a task for the leader; once the
  -- date has passed without a newer conversation the task stays open
  -- (overdue) instead of disappearing. A newer conversation closes it.
  v_keep := '{}';
  FOR r IN SELECT DISTINCT ON (s.employee_id) s.employee_id, s.leader_id, s.next_review_on, e.first_name || ' ' || e.last_name AS name
             FROM public.coaching_sessions s JOIN public.employees e ON e.id = s.employee_id AND e.status = 'active'
            ORDER BY s.employee_id, s.held_on DESC, s.created_at DESC LOOP
    CONTINUE WHEN r.next_review_on IS NULL OR r.next_review_on > v_today + 7;
    v_id := app_private.ensure_system_task('coaching_review', r.leader_id, 'Coaching-Gespräch mit ' || r.name,
              r.next_review_on::timestamptz, 'employee', r.employee_id,
              CASE WHEN r.next_review_on < v_today THEN 'high' ELSE 'normal' END, '/vertrieb/team/' || r.employee_id);
    v_keep := v_keep || v_id;
  END LOOP;
  PERFORM app_private.close_system_tasks('coaching_review', v_keep, 'Gespräch hat stattgefunden oder wurde neu geplant');

  -- career_period_end (≤ 30 days, not qualified)
  v_keep := '{}';
  FOR r IN SELECT e.id, e.first_name || ' ' || e.last_name AS name FROM public.employees e WHERE e.status = 'active' LOOP
    PERFORM app_private.generate_periods(r.id);
    q := app_private.compute_qualification(r.id, v_today);
    IF q ->> 'status' = 'in_progress' AND (q -> 'period' ->> 'end')::date <= v_today + 30 THEN
      v_id := app_private.ensure_system_task('career_period_end', r.id,
                format('Karrierezeitraum endet am %s: noch %s P / %s KV-P bis %s',
                       to_char((q -> 'period' ->> 'end')::date - 1, 'DD.MM.YYYY'),
                       trim_scale((q ->> 'points_missing')::numeric), trim_scale((q ->> 'kv_missing')::numeric), q ->> 'target'),
                ((q -> 'period' ->> 'end')::date - 1)::timestamptz, 'employee', r.id, 'high', '/vertrieb/karriere');
      v_keep := v_keep || v_id;
      v_mgr := app_private.active_manager_of(r.id);
      IF v_mgr IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.notifications n WHERE n.recipient_id = v_mgr AND n.kind = 'career_period_end'
           AND n.link = '/vertrieb/team/' || r.id AND n.created_at > now() - interval '7 days') THEN
        PERFORM app_private.notify(v_mgr, 'career_period_end', 'Karrierezeitraum endet bald: ' || r.name, NULL, '/vertrieb/team/' || r.id);
      END IF;
    END IF;
  END LOOP;
  PERFORM app_private.close_system_tasks('career_period_end', v_keep, 'Qualifiziert oder Zeitraum gewechselt');

  -- calculation_exception → every active finance user
  v_keep := '{}';
  FOR r IN SELECT x.id, x.reason_code, f.id AS finance_id
             FROM public.exception_queue x
             CROSS JOIN (SELECT e.id FROM public.employees e JOIN public.user_roles ur
                           ON ur.user_id = e.user_id AND ur.role = 'finance' AND ur.revoked_at IS NULL
                          WHERE e.status = 'active') f
            WHERE x.status = 'open' LOOP
    v_id := app_private.ensure_system_task('calculation_exception', r.finance_id, 'Prüffall: ' || r.reason_code,
              now(), 'exception', r.id, 'high', '/vertrieb/provisionen/abrechnung');
    v_keep := v_keep || v_id;
  END LOOP;
  PERFORM app_private.close_system_tasks('calculation_exception', v_keep, 'Prüffall erledigt');

  RETURN v_stats || jsonb_build_object('open_system_tasks', (SELECT count(*) FROM public.tasks WHERE source = 'system' AND status = 'open'));
END
$$;

-- ------------------------------------------------------------
-- P2-RATE-01 — a level without a rate row is an exception, never a silent skip
-- (an ancestor on VD+/GM with production dated before 2026-11-01, or any
-- level missing from a future rules version); the producer case crashed the
-- confirmation with a NOT NULL error before. Setting a level now checks the
-- code against the rules version in force at the effective date.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.book_commission_entries(p_calculation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  c          public.point_calculations%ROWTYPE;
  pr         public.production_records%ROWTYPE;
  v_period   uuid;
  v_version  uuid;
  v_reserve  numeric;
  v_p_level  text;
  v_p_rate   numeric;
  v_chain    jsonb;
  v_missing  jsonb;
  v_entries  jsonb;
  e          jsonb;
  o          public.commission_ledger%ROWTYPE;
  v_n        integer := 0;
BEGIN
  SELECT * INTO c FROM public.point_calculations WHERE id = p_calculation_id;
  SELECT * INTO pr FROM public.production_records WHERE id = c.production_id;
  -- Serialise bookings per calculation.
  PERFORM pg_advisory_xact_lock(hashtext('commission:' || p_calculation_id::text));
  IF EXISTS (SELECT 1 FROM public.commission_ledger WHERE calculation_id = p_calculation_id) THEN
    RETURN 0;
  END IF;

  v_period := app_private.booking_period();

  IF c.kind = 'reversal' THEN
    FOR o IN SELECT * FROM public.commission_ledger WHERE calculation_id = c.reverses_id AND entry_kind = 'original' ORDER BY seq LOOP
      INSERT INTO public.commission_ledger
        (calculation_id, production_id, producer_id, recipient_id, relationship, depth, producer_level, recipient_level,
         commission_type, entry_kind, reverses_entry_id, points, rate_per_point, gross_amount, reserve_amount,
         net_after_reserve, statement_period_id, rule_version_id)
      VALUES
        (c.id, o.production_id, o.producer_id, o.recipient_id, o.relationship, o.depth, o.producer_level, o.recipient_level,
         o.commission_type, 'reversal', o.id, -o.points, o.rate_per_point, -o.gross_amount, -o.reserve_amount,
         -o.net_after_reserve, v_period, o.rule_version_id);
      v_n := v_n + 1;
    END LOOP;
    -- The reversed calculation may never have been booked (open exception).
    UPDATE public.exception_queue
       SET status = 'dismissed', resolved_at = now(), resolution = 'Berechnung wurde storniert'
     WHERE entity_type = 'public.point_calculations' AND entity_id = c.reverses_id::text AND status = 'open';
    RETURN v_n;
  END IF;

  IF c.points = 0 THEN RETURN 0; END IF;

  v_version := app_private.rule_version_at('levels', pr.production_date);
  SELECT reserve_ratio INTO v_reserve FROM public.rule_versions WHERE id = v_version;
  v_p_level := app_private.level_at(pr.producer_id, pr.production_date);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.ancestor_id,
           'level', app_private.level_at(a.ancestor_id, pr.production_date),
           'rate', (SELECT l.point_rate FROM public.career_levels l
                     WHERE l.rule_version_id = v_version
                       AND l.code = app_private.level_at(a.ancestor_id, pr.production_date)))
         ORDER BY a.depth), '[]'::jsonb)
    INTO v_chain
    FROM app_private.ancestors_at(pr.producer_id, pr.production_date) a;

  -- An ancestor without a level, or whose level has no rate in the version
  -- at the production date, makes the chain uncomputable (§16: don't guess).
  SELECT jsonb_agg(x ->> 'id') INTO v_missing FROM jsonb_array_elements(v_chain) x
   WHERE x ->> 'level' IS NULL OR x ->> 'rate' IS NULL;
  IF v_version IS NOT NULL AND v_p_level IS NOT NULL THEN
    SELECT l.point_rate INTO v_p_rate FROM public.career_levels l WHERE l.rule_version_id = v_version AND l.code = v_p_level;
  END IF;

  IF v_version IS NULL OR v_p_level IS NULL OR v_p_rate IS NULL OR v_missing IS NOT NULL THEN
    PERFORM app_private.raise_exception_item('public.point_calculations', c.id::text,
      CASE WHEN v_version IS NULL THEN 'no_rules_for_date'
           WHEN v_p_level IS NULL THEN 'producer_without_level'
           WHEN v_p_rate IS NULL THEN 'level_without_rate'
           WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_chain) x WHERE x ->> 'level' IS NULL) THEN 'ancestor_without_level'
           ELSE 'level_without_rate' END,
      jsonb_build_object('production_id', pr.id, 'producer_id', pr.producer_id,
                         'production_date', pr.production_date, 'missing', v_missing));
    RETURN 0;
  END IF;

  v_entries := app_private.commission_split(c.points, pr.producer_id::text, v_p_rate, v_chain, v_reserve);

  FOR e IN SELECT * FROM jsonb_array_elements(v_entries) LOOP
    INSERT INTO public.commission_ledger
      (calculation_id, production_id, producer_id, recipient_id, relationship, depth, producer_level, recipient_level,
       commission_type, entry_kind, points, rate_per_point, gross_amount, reserve_amount, net_after_reserve,
       statement_period_id, rule_version_id)
    VALUES
      (c.id, pr.id, pr.producer_id, (e ->> 'recipient')::uuid,
       CASE (e ->> 'depth')::int WHEN 0 THEN 'self' WHEN 1 THEN 'direct' ELSE 'indirect' END,
       (e ->> 'depth')::int, v_p_level,
       CASE WHEN (e ->> 'depth')::int = 0 THEN v_p_level
            ELSE (SELECT x ->> 'level' FROM jsonb_array_elements(v_chain) WITH ORDINALITY AS t(x, n)
                   WHERE t.n = (e ->> 'depth')::int) END,
       e ->> 'type', 'original', c.points, (e ->> 'rate')::numeric, (e ->> 'gross')::numeric,
       (e ->> 'reserve')::numeric, (e ->> 'net')::numeric, v_period, v_version);
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.exception_queue
     SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution = 'Provision gebucht'
   WHERE entity_type = 'public.point_calculations' AND entity_id = c.id::text AND status = 'open';
  RETURN v_n;
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.book_commission_entries(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_rpc.rpc_set_employee_level(p_employee_id uuid, p_level_code text, p_effective_from date, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_reason text;
  v_start  date;
  v_latest date;
  v_source text;
BEGIN
  PERFORM app_private.assert_admin();
  v_reason := app_private.require_reason(p_reason);
  PERFORM pg_advisory_xact_lock(hashtext('career_level_history:' || p_employee_id::text));

  SELECT start_date INTO v_start FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_effective_from < v_start THEN RAISE EXCEPTION 'before_start_date' USING ERRCODE = 'P0001'; END IF;
  -- Levels change only with effect up to today: a future entry would
  -- silently override a promotion approved before that date.
  IF p_effective_from > app_private.business_today() THEN
    RAISE EXCEPTION 'level_in_future' USING ERRCODE = 'P0001';
  END IF;

  -- The level must exist (with a rate) in the rules version in force at the
  -- date; otherwise commission for that person could not be calculated.
  IF NOT EXISTS (SELECT 1 FROM public.career_levels l
                  WHERE l.rule_version_id = app_private.rule_version_at('levels', p_effective_from)
                    AND l.code = p_level_code AND l.point_rate IS NOT NULL) THEN
    RAISE EXCEPTION 'level_not_in_rules' USING ERRCODE = 'P0001';
  END IF;

  SELECT max(effective_from) INTO v_latest FROM public.career_level_history WHERE employee_id = p_employee_id;
  IF v_latest IS NOT NULL AND p_effective_from < v_latest THEN
    RAISE EXCEPTION 'before_latest_level' USING ERRCODE = 'P0001';
  END IF;
  IF app_private.level_at(p_employee_id, p_effective_from) = p_level_code THEN
    RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001';
  END IF;

  v_source := CASE WHEN v_latest IS NULL THEN 'initial' ELSE 'admin_correction' END;
  INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason, approved_by)
  VALUES (p_employee_id, p_level_code, p_effective_from, v_source, v_reason, auth.uid());
  RETURN v_source;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_set_employee_level(uuid, text, date, text)'::regprocedure);

-- ------------------------------------------------------------
-- P2-RACE-01 — no booking into a month that is being approved
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.booking_period()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_month date := date_trunc('month', app_private.business_today())::date;
  v_id    uuid;
  v_status text;
BEGIN
  LOOP
    INSERT INTO public.statement_periods (period_month) VALUES (v_month) ON CONFLICT (period_month) DO NOTHING;
    -- FOR SHARE: an approval (FOR UPDATE) in flight finishes first and the
    -- re-read sees its status, so no booking lands in a month being approved.
    SELECT id, status INTO v_id, v_status FROM public.statement_periods WHERE period_month = v_month FOR SHARE;
    IF v_status = 'open' THEN RETURN v_id; END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.booking_period() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- SEC-01 — no write privileges through views or vault tables, fail-safe defaults
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'v' LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated', r.relname);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated', r.relname);
  END LOOP;
END
$$;
-- A function created in public without an explicit GRANT must not be callable
-- by API roles (publish_rpc grants what it publishes).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- SEC-02 — statement months for employees and finance/admin only
-- ------------------------------------------------------------
DROP POLICY IF EXISTS statement_periods_select ON public.statement_periods;
CREATE POLICY statement_periods_select ON public.statement_periods FOR SELECT TO authenticated
  USING ((SELECT app_private.current_employee_id()) IS NOT NULL
         OR (SELECT app_private.has_role('finance'))
         OR (SELECT app_private.has_role('admin')));

-- ------------------------------------------------------------
-- SEC-03 — export log: own statement exports name the caller
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_log_export(p_kind text, p_scope jsonb, p_row_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_scope jsonb;
BEGIN
  IF p_kind NOT IN ('statement_overview', 'statement', 'ledger') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_scope, '{}'::jsonb)) <> 'object' OR length(p_scope::text) > 2000 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'statement' THEN
    -- The own statement: only employees have one, and the scope is the caller.
    IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    v_scope := jsonb_build_object('month', p_scope ->> 'month', 'employee_id', v_me);
  ELSE
    -- Every recipient's commission: finance/admin with MFA (§12.2).
    PERFORM app_private.assert_finance_or_admin();
    v_scope := p_scope;
  END IF;
  PERFORM app_private.log_event('export.' || p_kind, 'export', coalesce(v_scope ->> 'month', '-'),
                                jsonb_build_object('scope', v_scope, 'rows', greatest(coalesce(p_row_count, 0), 0)));
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_log_export(text, jsonb, integer)'::regprocedure);

NOTIFY pgrst, 'reload schema';
