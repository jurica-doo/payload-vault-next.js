-- ============================================================
-- r1/p3/goals: monthly goals with review workflow (spec §7.2, §14.5)
-- ============================================================
-- monthly_goals          one per employee and month; holds the editable
--                        draft and the workflow status
--                          draft → submitted → approved | returned
--                          returned/approved → (edit) → draft → submitted …
-- monthly_goal_versions  immutable copy of every submission (§7.2 "store
--                        each submitted version")
-- goal_reviews           append-only approval trail with manager comments
--
-- Who reviews: any active ancestor of the employee (today's structure) or
-- an admin — never the employee themselves. The "responsible" reviewer for
-- notifications is the nearest active ancestor (skips inactive managers).
-- Goals are targets, not career thresholds (§7.2): nothing here touches
-- qualification.
-- Months: the current month and up to two ahead; a past month is closed.
-- Submitting after the 1st is allowed but flagged as late.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monthly_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  month           date NOT NULL CHECK (extract(day FROM month) = 1),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),
  draft           jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_version integer NOT NULL DEFAULT 0,
  late            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month)
);

CREATE TABLE IF NOT EXISTS public.monthly_goal_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id          uuid NOT NULL REFERENCES public.monthly_goals (id) ON DELETE RESTRICT,
  version          integer NOT NULL CHECK (version > 0),
  targets          jsonb NOT NULL,
  employee_comment text,
  submitted_by     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, version)
);

CREATE TABLE IF NOT EXISTS public.goal_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     uuid NOT NULL REFERENCES public.monthly_goals (id) ON DELETE RESTRICT,
  version     integer NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  decision    text NOT NULL CHECK (decision IN ('approved', 'returned')),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_return_needs_comment CHECK (decision = 'approved' OR length(btrim(coalesce(comment, ''))) >= 3)
);

DROP TRIGGER IF EXISTS goals_touch ON public.monthly_goals;
CREATE TRIGGER goals_touch BEFORE UPDATE ON public.monthly_goals
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
DROP TRIGGER IF EXISTS goal_versions_append_only ON public.monthly_goal_versions;
CREATE TRIGGER goal_versions_append_only BEFORE UPDATE OR DELETE ON public.monthly_goal_versions
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();
DROP TRIGGER IF EXISTS goal_reviews_append_only ON public.goal_reviews;
CREATE TRIGGER goal_reviews_append_only BEFORE UPDATE OR DELETE ON public.goal_reviews
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

SELECT app_private.attach_audit('public.monthly_goals', 'id', '{updated_at,draft}');

-- ------------------------------------------------------------
-- Validation of target values
-- ------------------------------------------------------------
-- Allowed keys; numbers ≥ 0, counts are whole numbers, KV ≤ points.
-- AE defaults to points × AE factor of the conversion rules for the month.
CREATE OR REPLACE FUNCTION app_private.normalize_goal_targets(p_targets jsonb, p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key   text;
  v_val   jsonb;
  v_out   jsonb := '{}'::jsonb;
  v_ae    numeric;
  k_num   text[] := ARRAY['points', 'kv_points', 'ae', 'expected_gross'];
  k_int   text[] := ARRAY['appointments_booked', 'appointments_held', 'offers', 'sales', 'followups'];
BEGIN
  IF jsonb_typeof(coalesce(p_targets, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'invalid_targets' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(coalesce(p_targets, '{}'::jsonb)) LOOP
    CONTINUE WHEN v_val = 'null'::jsonb OR v_val = '""'::jsonb;
    IF v_key = ANY (k_num) THEN
      BEGIN
        IF (v_val #>> '{}')::numeric < 0 THEN RAISE EXCEPTION 'negative'; END IF;
        v_out := v_out || jsonb_build_object(v_key, round((v_val #>> '{}')::numeric, 2));
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'invalid_target_value' USING ERRCODE = '22023', DETAIL = v_key;
      END;
    ELSIF v_key = ANY (k_int) THEN
      BEGIN
        IF (v_val #>> '{}')::numeric < 0 OR (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric) THEN
          RAISE EXCEPTION 'bad';
        END IF;
        v_out := v_out || jsonb_build_object(v_key, (v_val #>> '{}')::integer);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'invalid_target_value' USING ERRCODE = '22023', DETAIL = v_key;
      END;
    ELSIF v_key = 'development_goal' THEN
      IF length(v_val #>> '{}') > 500 THEN RAISE EXCEPTION 'invalid_target_value' USING ERRCODE = '22023', DETAIL = v_key; END IF;
      v_out := v_out || jsonb_build_object(v_key, btrim(v_val #>> '{}'));
    ELSE
      RAISE EXCEPTION 'unknown_target' USING ERRCODE = '22023', DETAIL = v_key;
    END IF;
  END LOOP;

  IF (v_out ->> 'kv_points')::numeric > coalesce((v_out ->> 'points')::numeric, 0) THEN
    RAISE EXCEPTION 'kv_above_points' USING ERRCODE = '22023';
  END IF;
  IF v_out ? 'points' AND NOT v_out ? 'ae' THEN
    SELECT ae_per_point INTO v_ae FROM public.rule_versions WHERE id = app_private.rule_version_at('conversion', p_month);
    IF v_ae IS NOT NULL THEN
      v_out := v_out || jsonb_build_object('ae', round((v_out ->> 'points')::numeric * v_ae, 2));
    END IF;
  END IF;
  RETURN v_out;
END
$$;

-- Nearest active ancestor today (responsible reviewer).
CREATE OR REPLACE FUNCTION app_private.goal_reviewer(p_employee uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.ancestor_id
    FROM app_private.ancestors_at(p_employee, app_private.business_today()) a
    JOIN public.employees e ON e.id = a.ancestor_id AND e.status = 'active'
   ORDER BY a.depth
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_private.assert_goal_month_open(p_month date)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_current date := date_trunc('month', app_private.business_today())::date;
BEGIN
  IF p_month < v_current THEN RAISE EXCEPTION 'month_closed' USING ERRCODE = 'P0001'; END IF;
  IF p_month > (v_current + interval '2 months')::date THEN RAISE EXCEPTION 'month_too_far' USING ERRCODE = 'P0001'; END IF;
END
$$;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
-- Employee saves their own draft for a month (creates the goal if needed).
-- Editing an approved or returned goal puts it back to draft.
CREATE OR REPLACE FUNCTION public.rpc_save_goal_draft(p_month date, p_targets jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_month date := date_trunc('month', p_month)::date;
  v_norm  jsonb;
  v_id    uuid;
  v_status text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM app_private.assert_goal_month_open(v_month);
  v_norm := app_private.normalize_goal_targets(p_targets, v_month);

  INSERT INTO public.monthly_goals (employee_id, month, draft)
  VALUES (v_me, v_month, v_norm)
  ON CONFLICT (employee_id, month) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id, status INTO v_id, v_status FROM public.monthly_goals WHERE employee_id = v_me AND month = v_month FOR UPDATE;
    IF v_status = 'submitted' THEN RAISE EXCEPTION 'awaiting_review' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.monthly_goals SET draft = v_norm, status = 'draft' WHERE id = v_id;
  END IF;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_submit_goal(p_goal_id uuid, p_comment text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g public.monthly_goals%ROWTYPE;
BEGIN
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

CREATE OR REPLACE FUNCTION public.rpc_review_goal(p_goal_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g    public.monthly_goals%ROWTYPE;
  v_me uuid := app_private.current_employee_id();
BEGIN
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

-- ------------------------------------------------------------
-- RLS: employee, their structure (leaders) and admins
-- ------------------------------------------------------------
ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_goal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goals_select ON public.monthly_goals;
CREATE POLICY goals_select ON public.monthly_goals FOR SELECT TO authenticated
  USING (employee_id IN (SELECT app_private.visible_employee_ids()));
DROP POLICY IF EXISTS goal_versions_select ON public.monthly_goal_versions;
CREATE POLICY goal_versions_select ON public.monthly_goal_versions FOR SELECT TO authenticated
  USING (goal_id IN (SELECT g.id FROM public.monthly_goals g));
DROP POLICY IF EXISTS goal_reviews_select ON public.goal_reviews;
CREATE POLICY goal_reviews_select ON public.goal_reviews FOR SELECT TO authenticated
  USING (goal_id IN (SELECT g.id FROM public.monthly_goals g));

REVOKE ALL ON public.monthly_goals, public.monthly_goal_versions, public.goal_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.monthly_goals, public.monthly_goal_versions, public.goal_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_goals, public.monthly_goal_versions, public.goal_reviews TO service_role;

-- Goals with names and the responsible reviewer (RLS applies).
CREATE OR REPLACE VIEW public.v_goals
WITH (security_invoker = true) AS
SELECT g.*,
       e.first_name || ' ' || e.last_name AS employee_name,
       app_private.goal_reviewer(g.employee_id) AS reviewer_id,
       (SELECT v.targets FROM public.monthly_goal_versions v WHERE v.goal_id = g.id AND v.version = g.current_version) AS submitted_targets,
       (SELECT r.comment FROM public.goal_reviews r WHERE r.goal_id = g.id ORDER BY r.created_at DESC LIMIT 1) AS last_review_comment
  FROM public.monthly_goals g
  JOIN public.employees e ON e.id = g.employee_id;

REVOKE ALL ON public.v_goals FROM PUBLIC, anon;
GRANT SELECT ON public.v_goals TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.goal_reviewer(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_save_goal_draft(date, jsonb), public.rpc_submit_goal(uuid, text),
  public.rpc_review_goal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_goal_draft(date, jsonb), public.rpc_submit_goal(uuid, text),
  public.rpc_review_goal(uuid, text, text) TO authenticated;
