-- ============================================================
-- r1/p3/profiles-coaching: performance profiles and coaching (spec §8)
-- ============================================================
-- Visibility (stricter than general employee visibility, §8.4, §12.1–12.2):
--   coaching_sessions / coaching_actions: the employee, their managers in
--     today's structure. NOT finance, compliance or admins (least privilege).
--   coaching_notes 'shared': as above.
--   coaching_notes 'private_manager': only the author and the author's own
--     managers — never the employee, never finance (§8.4 "private manager
--     notes with strict permissions").
-- Notes are append-only (corrections are new notes); their text is redacted
-- in the audit trail so private content isn't copied there. Retention of
-- coaching data follows OD-16 (not automated yet).
--
-- rpc_performance_profile gives the §8.1 dimensions available today and
-- rule-based prompts (§8.3) — prompts for a conversation, never verdicts
-- (§8.5). Activity/conversion dimensions arrive with Phase 4.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coaching_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  leader_id      uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  held_on        date NOT NULL,
  participants   text,
  summary        text NOT NULL CHECK (length(btrim(summary)) BETWEEN 3 AND 4000),
  next_review_on date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coaching_not_self CHECK (employee_id <> leader_id),
  CONSTRAINT coaching_review_after CHECK (next_review_on IS NULL OR next_review_on >= held_on)
);

CREATE TABLE IF NOT EXISTS public.coaching_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES public.coaching_sessions (id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  owner_id    uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  due_on      date,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  done_at     timestamptz,
  created_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coaching_action_done CHECK ((status = 'done') = (done_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.coaching_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  author_id   uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  visibility  text NOT NULL CHECK (visibility IN ('private_manager', 'shared')),
  body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_employee ON public.coaching_sessions (employee_id, held_on DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_actions_employee ON public.coaching_actions (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_coaching_notes_employee ON public.coaching_notes (employee_id, created_at DESC);

DROP TRIGGER IF EXISTS coaching_notes_append_only ON public.coaching_notes;
CREATE TRIGGER coaching_notes_append_only BEFORE UPDATE OR DELETE ON public.coaching_notes
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

SELECT app_private.attach_audit('public.coaching_sessions', 'id', '{}', '{summary}');
SELECT app_private.attach_audit('public.coaching_actions');
SELECT app_private.attach_audit('public.coaching_notes', 'id', '{}', '{body}');

-- ------------------------------------------------------------
-- Visibility helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.is_manager_of(p_employee uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.current_employee_id() IS NOT NULL
     AND app_private.current_employee_id() IN (
           SELECT a.ancestor_id FROM app_private.ancestors_at(p_employee, app_private.business_today()) a)
$$;

CREATE OR REPLACE FUNCTION app_private.can_see_coaching(p_employee uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_employee = app_private.current_employee_id() OR app_private.is_manager_of(p_employee)
$$;

-- Private note: author or one of the author's managers.
CREATE OR REPLACE FUNCTION app_private.can_see_private_note(p_author uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_author = app_private.current_employee_id() OR app_private.is_manager_of(p_author)
$$;

GRANT EXECUTE ON FUNCTION app_private.is_manager_of(uuid), app_private.can_see_coaching(uuid),
  app_private.can_see_private_note(uuid) TO authenticated;

ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coaching_sessions_select ON public.coaching_sessions;
CREATE POLICY coaching_sessions_select ON public.coaching_sessions FOR SELECT TO authenticated
  USING (app_private.can_see_coaching(employee_id));
DROP POLICY IF EXISTS coaching_actions_select ON public.coaching_actions;
CREATE POLICY coaching_actions_select ON public.coaching_actions FOR SELECT TO authenticated
  USING (app_private.can_see_coaching(employee_id));
DROP POLICY IF EXISTS coaching_notes_select ON public.coaching_notes;
CREATE POLICY coaching_notes_select ON public.coaching_notes FOR SELECT TO authenticated
  USING (CASE visibility
           WHEN 'shared' THEN app_private.can_see_coaching(employee_id)
           ELSE app_private.can_see_private_note(author_id) AND employee_id <> app_private.current_employee_id()
         END);

REVOKE ALL ON public.coaching_sessions, public.coaching_actions, public.coaching_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coaching_sessions, public.coaching_actions, public.coaching_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_sessions, public.coaching_actions, public.coaching_notes TO service_role;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
-- A coaching conversation with agreed actions (§8.4).
-- p_actions: [{"title": "…", "owner": "employee"|"leader", "due_on": "YYYY-MM-DD"}]
CREATE OR REPLACE FUNCTION public.rpc_add_coaching_session(
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
  IF p_held_on > app_private.business_today() THEN RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.coaching_sessions (employee_id, leader_id, held_on, participants, summary, next_review_on)
  VALUES (p_employee_id, v_me, p_held_on, nullif(btrim(coalesce(p_participants, '')), ''), btrim(p_summary), p_next_review_on)
  RETURNING id INTO v_id;

  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) LOOP
    IF a ->> 'owner' NOT IN ('employee', 'leader') THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.coaching_actions (session_id, employee_id, owner_id, title, due_on, created_by)
    VALUES (v_id, p_employee_id, CASE a ->> 'owner' WHEN 'employee' THEN p_employee_id ELSE v_me END,
            btrim(a ->> 'title'), nullif(a ->> 'due_on', '')::date, auth.uid());
  END LOOP;
  RETURN v_id;
END
$$;

-- The action's owner or a manager of the employee may change its status.
CREATE OR REPLACE FUNCTION public.rpc_set_coaching_action_status(p_action_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  x public.coaching_actions%ROWTYPE;
BEGIN
  SELECT * INTO x FROM public.coaching_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (x.owner_id = app_private.current_employee_id() OR app_private.is_manager_of(x.employee_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'done', 'cancelled') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023'; END IF;
  UPDATE public.coaching_actions
     SET status = p_status, done_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END
   WHERE id = p_action_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_add_coaching_note(p_employee_id uuid, p_visibility text, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT app_private.is_manager_of(p_employee_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.coaching_notes (employee_id, author_id, visibility, body)
  VALUES (p_employee_id, app_private.current_employee_id(), p_visibility, btrim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- ------------------------------------------------------------
-- Performance profile (§8.1, §8.3)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_performance_profile(p_employee_id uuid)
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
BEGIN
  IF NOT (p_employee_id = app_private.current_employee_id() OR app_private.is_manager_of(p_employee_id) OR app_private.has_role('admin')) THEN
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
    'next_review_on', CASE WHEN v_coach THEN (SELECT min(next_review_on) FROM public.coaching_sessions
                                               WHERE employee_id = e.id AND next_review_on >= v_today) END)
    FROM public.employees e WHERE e.id = p_employee_id);
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_add_coaching_session(uuid, date, text, text, date, jsonb),
  public.rpc_set_coaching_action_status(uuid, text), public.rpc_add_coaching_note(uuid, text, text),
  public.rpc_performance_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_coaching_session(uuid, date, text, text, date, jsonb),
  public.rpc_set_coaching_action_status(uuid, text), public.rpc_add_coaching_note(uuid, text, text),
  public.rpc_performance_profile(uuid) TO authenticated;
