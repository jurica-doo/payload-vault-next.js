-- ============================================================
-- Career: promotion-day production counts once; no future levels
-- ============================================================
-- 1. A promotion takes effect on the approval day, and the approval counted
--    production up to and including that day. The new level's counting
--    window started on the same day, so those contracts counted again
--    towards the next level (a person with 400 P dated today could be
--    promoted twice on consecutive days). After a promotion the window now
--    starts the next day. Initial levels and admin corrections keep their
--    own date. (OD-02: restart after promotion is provisional.)
--
-- 2. rpc_set_employee_level accepted future dates. Such an entry overrides
--    any promotion approved before that date and can't be withdrawn (the
--    level history is append-only), so levels now take effect up to today.
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.compute_qualification(p_employee uuid, p_as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  v_level      text := app_private.level_at(p_employee, p_as_of);
  v_level_from date;
  v_version    uuid := app_private.rule_version_at('levels', p_as_of);
  v_current    public.career_levels%ROWTYPE;
  v_target     public.career_levels%ROWTYPE;
  v_period     public.career_periods%ROWTYPE;
  v_from       date;
  v_level_source text;
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

  SELECT h.effective_from, h.source INTO v_level_from, v_level_source
    FROM public.career_level_history h
   WHERE h.employee_id = p_employee AND h.effective_from <= p_as_of
   ORDER BY h.effective_from DESC, h.created_at DESC
   LIMIT 1;
  -- A promotion was approved on a qualification that counted production up
  -- to and including its effective date (OD-02), so the new level counts
  -- from the next day; otherwise those contracts would count twice.
  v_from := greatest(v_period.start_date,
                     v_level_from + CASE WHEN v_level_source = 'promotion' THEN 1 ELSE 0 END);
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

CREATE OR REPLACE FUNCTION app_rpc.rpc_set_employee_level(p_employee_id uuid, p_level_code text, p_effective_from date, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
