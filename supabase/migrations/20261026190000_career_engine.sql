-- ============================================================
-- r1/p1/career-engine: career periods, qualification, promotions
-- ============================================================
-- Spec §4 and §14.4.
--
-- Career periods (§4.1–4.3; boundaries provisional, OD-01/OD-02)
--   first_personal  [start_date, start_date + 1 year)
--                   (a 29 February start ends on 1 March, not 28 February)
--   transition      [end of first year, next 1 January) — skipped if empty
--   calendar        whole calendar years after that
--   Periods are stored (§4.2: never derived from today's start date alone)
--   and generated idempotently up to the period containing today. If an
--   admin changes an employee's start date, the periods are regenerated;
--   approved promotions keep their own copy of the evidence.
--
-- Qualification (§4.4, §4.5; OD-03/OD-04 provisional)
--   Counting window: the current period, but not before the date the current
--   level became effective (promotion mid-period → points restart, no
--   carry-over, OD-02).
--   Points = SUM of the eligible ledger (point_calculations) of production
--   dated in the window, attributed with the hierarchy ON THE PRODUCTION DATE:
--     * own production → "personal", never capped
--     * production anywhere below → the structure of the direct report on
--       that path (each direct report's subtree = one structure, OD-04)
--   Target = next level. If the target has a structure cap ratio:
--     eligible per structure = min(gross, threshold × ratio)
--     eligible KV per structure = gross KV × eligible ÷ gross   (OD-03)
--   Ready iff eligible ≥ threshold AND eligible KV ≥ threshold × KV ratio.
--   Nothing is stored: every call computes from the ledger, so corrections
--   and cancellations are reflected immediately (deviation from the plan's
--   snapshot tables; the evidence is frozen only on promotion).
--
-- app_private.apply_career_rules(...) is the pure rule function; it is
-- mirrored by src/domain/qualification.ts and both are tested with the
-- same golden cases (GC-CAREER-xxx).
--
-- Promotions (OD-15): admins approve from the "ready" queue; the full
-- calculation is stored as evidence in career_level_history. One level at a
-- time; levels are never lowered by the engine (§4.3).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.career_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  period_type text NOT NULL CHECK (period_type IN ('first_personal', 'transition', 'calendar')),
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_period_range CHECK (end_date > start_date),
  CONSTRAINT career_period_no_overlap EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_career_periods_employee ON public.career_periods (employee_id, start_date);

-- ------------------------------------------------------------
-- Periods
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.first_year_end(p_start date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN extract(month FROM p_start) = 2 AND extract(day FROM p_start) = 29
              THEN make_date(extract(year FROM p_start)::int + 1, 3, 1)
              ELSE (p_start + interval '1 year')::date END
$$;

-- Periods for a start date, up to (and including) the one containing p_until.
CREATE OR REPLACE FUNCTION app_private.period_plan(p_start date, p_until date)
RETURNS TABLE (period_type text, start_date date, end_date date)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_first_end date := app_private.first_year_end(p_start);
  v_jan       date := make_date(extract(year FROM v_first_end)::int + 1, 1, 1);
  v_year      date;
BEGIN
  period_type := 'first_personal'; start_date := p_start; end_date := v_first_end;
  RETURN NEXT;
  IF v_first_end > p_until THEN RETURN; END IF;

  IF extract(month FROM v_first_end) = 1 AND extract(day FROM v_first_end) = 1 THEN
    v_year := v_first_end; -- first year ended on 1 January: no transition
  ELSE
    period_type := 'transition'; start_date := v_first_end; end_date := v_jan;
    RETURN NEXT;
    v_year := v_jan;
  END IF;

  WHILE v_year <= p_until LOOP
    period_type := 'calendar'; start_date := v_year; end_date := (v_year + interval '1 year')::date;
    RETURN NEXT;
    v_year := end_date;
  END LOOP;
END
$$;

-- Stores missing periods for an employee; regenerates all if the start
-- date no longer matches the stored first period.
CREATE OR REPLACE FUNCTION app_private.generate_periods(p_employee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start date;
BEGIN
  SELECT start_date INTO v_start FROM public.employees WHERE id = p_employee;
  IF v_start IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.career_periods
              WHERE employee_id = p_employee AND period_type = 'first_personal' AND start_date <> v_start) THEN
    DELETE FROM public.career_periods WHERE employee_id = p_employee;
  END IF;

  INSERT INTO public.career_periods (employee_id, period_type, start_date, end_date)
  SELECT p_employee, p.period_type, p.start_date, p.end_date
    FROM app_private.period_plan(v_start, greatest(app_private.business_today(), v_start)) p
   WHERE NOT EXISTS (SELECT 1 FROM public.career_periods c
                      WHERE c.employee_id = p_employee AND c.start_date = p.start_date);
END
$$;

-- ------------------------------------------------------------
-- Pure rule function (mirrored in TypeScript)
-- ------------------------------------------------------------
-- p_structures: [{"id": "…", "points": "800", "kv": "80"}, …]
CREATE OR REPLACE FUNCTION app_private.apply_career_rules(
  p_threshold       numeric,
  p_kv_ratio        numeric,
  p_cap_ratio       numeric,
  p_personal_points numeric,
  p_personal_kv     numeric,
  p_structures      jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH s AS (
    SELECT x ->> 'id' AS id,
           greatest(coalesce((x ->> 'points')::numeric, 0), 0) AS gross,
           greatest(coalesce((x ->> 'kv')::numeric, 0), 0) AS gross_kv
      FROM jsonb_array_elements(coalesce(p_structures, '[]'::jsonb)) x
  ),
  e AS (
    SELECT s.*,
           CASE WHEN p_cap_ratio IS NULL THEN s.gross
                ELSE least(s.gross, p_threshold * p_cap_ratio) END AS eligible
      FROM s
  ),
  f AS (
    SELECT e.*,
           CASE WHEN e.gross = 0 THEN 0
                ELSE round(e.gross_kv * e.eligible / e.gross, 4) END AS eligible_kv,
           (p_cap_ratio IS NOT NULL AND e.gross > p_threshold * p_cap_ratio) AS cap_applied
      FROM e
  ),
  t AS (
    SELECT greatest(p_personal_points, 0) + coalesce((SELECT sum(eligible) FROM f), 0) AS eligible,
           greatest(p_personal_kv, 0) + coalesce((SELECT sum(eligible_kv) FROM f), 0) AS eligible_kv
  )
  SELECT jsonb_build_object(
    'required', p_threshold,
    'kv_required', round(p_threshold * p_kv_ratio, 4),
    'cap_value', CASE WHEN p_cap_ratio IS NULL THEN NULL ELSE p_threshold * p_cap_ratio END,
    'personal', jsonb_build_object('points', greatest(p_personal_points, 0), 'kv', greatest(p_personal_kv, 0)),
    'structures', coalesce((SELECT jsonb_agg(jsonb_build_object(
                     'id', f.id, 'gross', f.gross, 'gross_kv', f.gross_kv, 'eligible', f.eligible,
                     'eligible_kv', f.eligible_kv, 'cap_applied', f.cap_applied) ORDER BY f.gross DESC, f.id)
                   FROM f), '[]'::jsonb),
    'eligible', t.eligible,
    'eligible_kv', t.eligible_kv,
    'points_missing', greatest(p_threshold - t.eligible, 0),
    'kv_missing', greatest(round(p_threshold * p_kv_ratio, 4) - t.eligible_kv, 0),
    'is_ready', t.eligible >= p_threshold AND t.eligible_kv >= round(p_threshold * p_kv_ratio, 4))
  FROM t
$$;

-- ------------------------------------------------------------
-- Structure membership on a date
-- ------------------------------------------------------------
-- Every descendant of p_leader on p_date with the direct report whose
-- subtree it belongs to ("structure root", OD-04). One recursive query per
-- date instead of one per production record.
CREATE OR REPLACE FUNCTION app_private.structure_roots_at(p_leader uuid, p_date date)
RETURNS TABLE (descendant_id uuid, root_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE tree (employee_id, root_id, path) AS (
    SELECT a.employee_id, a.employee_id, ARRAY[p_leader, a.employee_id]
      FROM public.hierarchy_assignments a
     WHERE a.manager_id = p_leader
       AND a.effective_from <= p_date
       AND (a.effective_to IS NULL OR a.effective_to > p_date)
    UNION ALL
    SELECT a.employee_id, t.root_id, t.path || a.employee_id
      FROM tree t
      JOIN public.hierarchy_assignments a
        ON a.manager_id = t.employee_id
       AND a.effective_from <= p_date
       AND (a.effective_to IS NULL OR a.effective_to > p_date)
     WHERE NOT a.employee_id = ANY (t.path)
  )
  SELECT employee_id, root_id FROM tree
$$;

-- ------------------------------------------------------------
-- Qualification for one employee on a date
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.compute_qualification(p_employee uuid, p_as_of date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_level      text := app_private.level_at(p_employee, p_as_of);
  v_level_from date;
  v_version    uuid := app_private.rule_version_at('levels', p_as_of);
  v_current    public.career_levels%ROWTYPE;
  v_target     public.career_levels%ROWTYPE;
  v_period     public.career_periods%ROWTYPE;
  v_from       date;
  v_to         date;
  v_personal   record;
  v_structs    jsonb;
  v_result     jsonb;
  v_days_total numeric;
  v_days_done  numeric;
BEGIN
  SELECT * INTO v_period FROM public.career_periods
   WHERE employee_id = p_employee AND start_date <= p_as_of AND end_date > p_as_of;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'blocked', 'reason', 'no_period');
  END IF;
  IF v_level IS NULL THEN
    RETURN jsonb_build_object('status', 'blocked', 'reason', 'no_level',
      'period', jsonb_build_object('type', v_period.period_type, 'start', v_period.start_date, 'end', v_period.end_date));
  END IF;
  IF v_version IS NULL THEN
    RETURN jsonb_build_object('status', 'blocked', 'reason', 'no_rules_for_date');
  END IF;

  SELECT * INTO v_current FROM public.career_levels WHERE rule_version_id = v_version AND code = v_level;
  SELECT * INTO v_target FROM public.career_levels WHERE rule_version_id = v_version AND rank = v_current.rank + 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'top_level', 'level', v_level);
  END IF;

  SELECT max(h.effective_from) INTO v_level_from
    FROM public.career_level_history h
   WHERE h.employee_id = p_employee AND h.effective_from <= p_as_of;
  v_from := greatest(v_period.start_date, v_level_from);
  v_to := p_as_of + 1; -- window is [v_from, as_of] inclusive

  -- Personal production
  SELECT coalesce(sum(pc.points), 0) AS points, coalesce(sum(pc.kv_points), 0) AS kv
    INTO v_personal
    FROM public.production_records pr
    JOIN public.point_calculations pc ON pc.production_id = pr.id
   WHERE pr.producer_id = p_employee
     AND pr.production_date >= v_from AND pr.production_date < v_to;

  -- Structure production, attributed with the hierarchy on the production
  -- date. The structure only changes on assignment boundaries, so the window
  -- is split into segments at those dates and membership is resolved once
  -- per segment.
  WITH bounds AS (
    SELECT v_from AS d
    UNION
    SELECT a.effective_from FROM public.hierarchy_assignments a WHERE a.effective_from > v_from AND a.effective_from < v_to
    UNION
    SELECT a.effective_to FROM public.hierarchy_assignments a WHERE a.effective_to > v_from AND a.effective_to < v_to
  ),
  segments AS (
    SELECT d AS seg_start, lead(d, 1, v_to) OVER (ORDER BY d) AS seg_end FROM bounds
  ),
  members AS (
    SELECT sg.seg_start, sg.seg_end, m.descendant_id, m.root_id
      FROM segments sg
      CROSS JOIN LATERAL app_private.structure_roots_at(p_employee, sg.seg_start) m
  ),
  attributed AS (
    SELECT m.root_id, pc.points, pc.kv_points
      FROM members m
      JOIN public.production_records pr
        ON pr.producer_id = m.descendant_id
       AND pr.production_date >= m.seg_start AND pr.production_date < m.seg_end
      JOIN public.point_calculations pc ON pc.production_id = pr.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', root_id, 'points', pts, 'kv', kv)), '[]'::jsonb)
    INTO v_structs
    FROM (SELECT root_id, sum(points) AS pts, sum(kv_points) AS kv FROM attributed GROUP BY root_id) g;

  v_result := app_private.apply_career_rules(
    v_target.threshold_points, v_target.kv_min_ratio, v_target.structure_cap_ratio,
    v_personal.points, v_personal.kv, v_structs);

  -- Names for display (the caller may see them: they are in the structure).
  v_result := jsonb_set(v_result, '{structures}', coalesce((
    SELECT jsonb_agg(s || jsonb_build_object('name', e.first_name || ' ' || e.last_name))
      FROM jsonb_array_elements(v_result -> 'structures') s
      JOIN public.employees e ON e.id = (s ->> 'id')::uuid), '[]'::jsonb));

  v_days_total := v_period.end_date - v_from;
  v_days_done := v_to - v_from;

  RETURN v_result || jsonb_build_object(
    'status', CASE WHEN (v_result ->> 'is_ready')::boolean THEN 'ready' ELSE 'in_progress' END,
    'employee_id', p_employee,
    'as_of', p_as_of,
    'level', v_level,
    'target', v_target.code,
    'rule_version_id', v_version,
    'window', jsonb_build_object('start', v_from, 'end', v_period.end_date),
    'period', jsonb_build_object('type', v_period.period_type, 'start', v_period.start_date, 'end', v_period.end_date),
    -- Linear pace: where the employee "should" be today to reach the target
    -- by the period end. An estimate for display only (§7.4, §7.5).
    'expected_now', CASE WHEN v_days_total > 0
                         THEN round(v_target.threshold_points * least(v_days_done / v_days_total, 1), 4) ELSE NULL END);
END
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.career_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_periods_select ON public.career_periods;
CREATE POLICY career_periods_select ON public.career_periods FOR SELECT TO authenticated
  USING (employee_id IN (SELECT app_private.visible_employee_ids()));

REVOKE ALL ON public.career_periods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.career_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_periods TO service_role;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
-- Progress for oneself or someone in one's structure (§7.4).
CREATE OR REPLACE FUNCTION public.rpc_career_progress(p_employee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp uuid := coalesce(p_employee_id, app_private.current_employee_id());
BEGIN
  IF v_emp IS NULL OR NOT app_private.can_see_employee(v_emp) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM app_private.generate_periods(v_emp);
  RETURN app_private.compute_qualification(v_emp, app_private.business_today());
END
$$;

-- Everyone whose qualification is ready today (admin + MFA).
CREATE OR REPLACE FUNCTION public.rpc_promotion_queue()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp uuid;
  v_q   jsonb;
BEGIN
  PERFORM app_private.assert_admin();
  FOR v_emp IN SELECT id FROM public.employees WHERE status = 'active' ORDER BY last_name, first_name LOOP
    PERFORM app_private.generate_periods(v_emp);
    v_q := app_private.compute_qualification(v_emp, app_private.business_today());
    IF v_q ->> 'status' = 'ready' THEN
      RETURN NEXT v_q || (SELECT jsonb_build_object('name', e.first_name || ' ' || e.last_name, 'employee_no', e.employee_no)
                            FROM public.employees e WHERE e.id = v_emp);
    END IF;
  END LOOP;
END
$$;

-- Approves the promotion to the next level, effective today, if (and only
-- if) the qualification is ready right now. Stores the calculation as evidence.
CREATE OR REPLACE FUNCTION public.rpc_approve_promotion(p_employee_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text;
  v_q      jsonb;
BEGIN
  PERFORM app_private.assert_admin();
  v_reason := app_private.require_reason(p_reason);
  PERFORM pg_advisory_xact_lock(hashtext('career_level_history:' || p_employee_id::text));
  PERFORM app_private.generate_periods(p_employee_id);

  v_q := app_private.compute_qualification(p_employee_id, app_private.business_today());
  IF v_q ->> 'status' <> 'ready' THEN
    RAISE EXCEPTION 'not_qualified' USING ERRCODE = 'P0001', DETAIL = coalesce(v_q ->> 'reason', v_q ->> 'status');
  END IF;
  IF EXISTS (SELECT 1 FROM public.career_level_history
              WHERE employee_id = p_employee_id AND effective_from = app_private.business_today()) THEN
    RAISE EXCEPTION 'level_changed_today' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, evidence, reason, approved_by)
  VALUES (p_employee_id, v_q ->> 'target', app_private.business_today(), 'promotion', v_q, v_reason, auth.uid());
  RETURN v_q ->> 'target';
END
$$;

-- Admin: (re)generate periods for everyone, e.g. after the first rollout.
CREATE OR REPLACE FUNCTION public.rpc_generate_all_periods()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp uuid;
  v_n   integer := 0;
BEGIN
  PERFORM app_private.assert_admin();
  FOR v_emp IN SELECT id FROM public.employees LOOP
    PERFORM app_private.generate_periods(v_emp);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_career_progress(uuid), public.rpc_promotion_queue(),
  public.rpc_approve_promotion(uuid, text), public.rpc_generate_all_periods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_career_progress(uuid), public.rpc_promotion_queue(),
  public.rpc_approve_promotion(uuid, text), public.rpc_generate_all_periods() TO authenticated;
