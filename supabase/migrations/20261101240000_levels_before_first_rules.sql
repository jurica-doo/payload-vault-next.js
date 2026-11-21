-- ============================================================
-- Starting levels for people who started before the first rules version
-- ============================================================
-- Found in the journey test (2026-11-21): creating an employee with a start
-- date in 2025 failed to set the starting level ("level_not_in_rules"),
-- because no rules version exists before 01.01.2026. Such dates are now
-- checked against the first published levels version. Levels that only
-- exist later (VD+, GM from 01.11.2026) are still refused before that.
-- ============================================================
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
  -- People who started before the first rules version (01.01.2026) are
  -- checked against that first version (2026-11-21: the operator and his
  -- team started in 2025, so their starting level was refused).
  IF NOT EXISTS (SELECT 1 FROM public.career_levels l
                  WHERE l.rule_version_id = app_private.rule_version_at('levels', greatest(p_effective_from,
                          (SELECT min(v.effective_from) FROM public.rule_versions v WHERE v.kind = 'levels' AND v.status = 'published')))
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
