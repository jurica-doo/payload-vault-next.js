-- ============================================================
-- Profina's last decisions (2026-11-21)
-- ============================================================
--  1. Rechtsschutz creates career points AND commission per point.
--     Kfz creates neither for now; both stay switchable per line in a rules
--     draft: conversion_rules.counts_for_career (points for the career) and
--     pays_commission (commission per point; needs points). A line that
--     doesn't count gets 0 points (formula "derzeit keine Punkte").
--     The 2026-11-01 conversion version is corrected in place: it is the same
--     "Stand 01.11.2026", corrected by Profina before go-live (nothing is in
--     production yet). Already stored calculations keep their numbers.
--  2. Own contracts count for the career (already so: own_contract only
--     blocks commission). No change.
--  3. VD+ and GM use the VD rate until the management decides (already so:
--     point_rate 144). No longer provisional.
--  4. Confirmation year (Anlage 2): after a promotion the person must reach
--     at least 80 % of the new level's points threshold in the 12 full
--     calendar months after the promotion month (personal + whole structure,
--     no 50 % clause). Missed → the management decides: keep or demote to
--     the previous level (source 'demotion', commission from the next month).
--     Not for VD+ / GM. Mirrored by src/domain/confirmation.ts.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kfz / Rechtsschutz switches
-- ------------------------------------------------------------
ALTER TABLE public.conversion_rules
  ADD COLUMN IF NOT EXISTS counts_for_career boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.conversion_rules.counts_for_career IS
  'false: the line creates no points/AE (no career points, hence no commission per point). Kfz from 2026-11 (Profina, 2026-11-21).';
COMMENT ON COLUMN public.conversion_rules.pays_commission IS
  'false: the line''s points count for the career but book no commission per point. true needs counts_for_career.';

ALTER TABLE public.conversion_rules DISABLE TRIGGER conversion_rules_immutable;
SELECT set_config('app.reason', 'Korrektur Profina 21.11.2026: Rechtsschutz mit Provision, Kfz ohne Punkte und Provision', true);
UPDATE public.conversion_rules c
   SET counts_for_career = (c.category_code <> 'KFZ'),
       pays_commission   = CASE c.category_code WHEN 'KFZ' THEN false WHEN 'RS' THEN true ELSE c.pays_commission END
  FROM public.rule_versions v
 WHERE v.id = c.rule_version_id AND v.kind = 'conversion' AND v.effective_from = DATE '2026-11-01'
   AND c.category_code IN ('KFZ', 'RS');
ALTER TABLE public.conversion_rules ENABLE TRIGGER conversion_rules_immutable;

ALTER TABLE public.conversion_rules DROP CONSTRAINT IF EXISTS conversion_commission_needs_points;
ALTER TABLE public.conversion_rules
  ADD CONSTRAINT conversion_commission_needs_points CHECK (NOT pays_commission OR counts_for_career OR formula_kind = 'none');

-- Same as 20261101140000, plus the counts_for_career gate.
CREATE OR REPLACE FUNCTION app_private.calculate_points(
  p_category       text,
  p_premium        numeric,
  p_period         text,
  p_net_or_gross   text,
  p_currency       text,
  p_term_years     numeric,
  p_production_day date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version  uuid := app_private.rule_version_at('conversion', p_production_day);
  v_ae_rate  numeric;
  v_unit     text;
  r          public.conversion_rules%ROWTYPE;
  v_is_kv    boolean;
  v_basis    numeric;
  v_exact    numeric;
  v_points   numeric;
  v_ae       numeric;
  v_term     numeric;
  v_capped   boolean := false;
  v_formula  text;
  v_div      text;
  v_steps    jsonb := '[]'::jsonb;
BEGIN
  IF v_version IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_rules_for_date'); END IF;
  IF p_premium IS NULL OR p_premium <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'premium_must_be_positive'); END IF;
  IF coalesce(p_currency, 'EUR') <> 'EUR' THEN RETURN jsonb_build_object('ok', false, 'error', 'currency_not_supported'); END IF;

  SELECT * INTO r FROM public.conversion_rules c WHERE c.rule_version_id = v_version AND c.category_code = p_category;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown_category'); END IF;
  SELECT pc.is_kv INTO v_is_kv FROM public.product_categories pc WHERE pc.code = p_category;
  SELECT v.ae_per_point, v.divisor_unit INTO v_ae_rate, v_unit FROM public.rule_versions v WHERE v.id = v_version;
  v_div := CASE WHEN v_unit = 'ae' THEN trim_scale(r.divisor)::text ELSE r.divisor::text END;

  IF r.required_premium_period IS NOT NULL AND p_period IS DISTINCT FROM r.required_premium_period THEN
    RETURN jsonb_build_object('ok', false, 'error', 'premium_period_mismatch');
  END IF;
  IF r.required_net_gross IS NOT NULL AND p_net_or_gross IS DISTINCT FROM r.required_net_gross THEN
    RETURN jsonb_build_object('ok', false, 'error', 'net_premium_required');
  END IF;

  IF NOT r.counts_for_career THEN
    v_basis := NULL;
    v_formula := 'derzeit keine Punkte für diese Sparte';
  ELSE
    CASE r.formula_kind
      WHEN 'lv_monthly_term' THEN
        IF p_term_years IS NULL OR p_term_years <= 0 THEN
          RETURN jsonb_build_object('ok', false, 'error', 'term_required');
        END IF;
        v_term := p_term_years;
        IF r.max_term_years IS NOT NULL AND p_term_years > r.max_term_years THEN
          v_term := r.max_term_years;
          v_capped := true;
        END IF;
        v_basis := p_premium * 12 * v_term;
        v_formula := format('%s × 12 × %s ÷ %s', p_premium, v_term, v_div);
        v_steps := jsonb_build_array(jsonb_build_object('label', 'Beitragssumme', 'value', v_basis::text));
      WHEN 'kv_monthly', 'sach_annual_net' THEN
        v_basis := p_premium;
        v_formula := format('%s ÷ %s', p_premium, v_div);
      ELSE
        v_basis := NULL;
        v_formula := 'keine Punkte für diese Sparte';
    END CASE;
  END IF;

  IF v_basis IS NULL THEN
    v_exact := 0;
    v_points := round(v_exact, 4);
    v_ae := CASE WHEN v_unit = 'ae' THEN round(v_exact, 2) ELSE round(v_exact, 4) END;
  ELSIF v_unit = 'ae' THEN
    v_ae := round(v_basis / r.divisor, 2);
    v_exact := v_ae / v_ae_rate;
    v_points := round(v_exact, 4);
    v_formula := v_formula || format(' = %s AE; %s AE ÷ %s', v_ae, v_ae, trim_scale(v_ae_rate));
    v_steps := v_steps || jsonb_build_array(jsonb_build_object('label', 'Absatzeinheiten', 'value', v_ae::text));
  ELSE
    v_exact := v_basis / r.divisor;
    v_points := round(v_exact, 4);
    v_ae := round(v_points * v_ae_rate, 4);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'points', v_points::text,
    'ae', v_ae::text,
    'kv_points', (CASE WHEN v_is_kv THEN v_points ELSE 0 END)::numeric(14, 4)::text,
    'rule_version_id', v_version,
    'details', jsonb_build_object(
      'category', p_category,
      'formula_kind', r.formula_kind,
      'formula', v_formula,
      'inputs', jsonb_build_object('premium', p_premium::text, 'period', p_period, 'net_or_gross', p_net_or_gross,
                                   'term_years', p_term_years::text, 'production_date', p_production_day),
      'divisor', r.divisor::text,
      'divisor_unit', v_unit,
      'term_used', v_term::text,
      'term_capped', v_capped,
      'exact_points', v_exact::text,
      'ae_per_point', v_ae_rate::text,
      'pays_commission', r.pays_commission,
      'counts_for_career', r.counts_for_career,
      'steps', v_steps,
      'is_kv', v_is_kv));
END
$$;

-- Drafts copy the new switch.
CREATE OR REPLACE FUNCTION app_rpc.rpc_create_rule_draft(p_kind text, p_label text, p_effective_from date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source uuid;
  v_new    uuid;
BEGIN
  PERFORM app_private.assert_admin();
  IF p_kind NOT IN ('levels', 'conversion') THEN RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.rule_versions WHERE kind = p_kind AND status = 'draft') THEN
    RAISE EXCEPTION 'draft_exists' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_source FROM public.rule_versions
   WHERE kind = p_kind AND status = 'published' ORDER BY effective_from DESC LIMIT 1;

  INSERT INTO public.rule_versions (kind, label, effective_from, ae_per_point, reserve_ratio, divisor_unit, created_by)
  SELECT p_kind, btrim(p_label), p_effective_from,
         (SELECT ae_per_point FROM public.rule_versions WHERE id = v_source),
         (SELECT reserve_ratio FROM public.rule_versions WHERE id = v_source),
         coalesce((SELECT divisor_unit FROM public.rule_versions WHERE id = v_source), 'points'),
         auth.uid()
  RETURNING id INTO v_new;

  IF p_kind = 'levels' THEN
    INSERT INTO public.career_levels
      (rule_version_id, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio,
       structure_cap_ratio, appointed_only, own_min_points, min_retention_ratio)
    SELECT v_new, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio,
           structure_cap_ratio, appointed_only, own_min_points, min_retention_ratio
      FROM public.career_levels WHERE rule_version_id = v_source;
  ELSE
    INSERT INTO public.conversion_rules
      (rule_version_id, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross,
       pays_commission, counts_for_career)
    SELECT v_new, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross,
           pays_commission, counts_for_career
      FROM public.conversion_rules WHERE rule_version_id = v_source;
  END IF;
  RETURN v_new;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_create_rule_draft(text, text, date)'::regprocedure);

-- Switch a line on or off in a conversion draft (published versions are
-- protected by the immutability trigger).
CREATE OR REPLACE FUNCTION app_rpc.rpc_update_conversion_flags_draft(
  p_version_id        uuid,
  p_category_code     text,
  p_counts_for_career boolean,
  p_pays_commission   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  IF p_counts_for_career IS NULL OR p_pays_commission IS NULL THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  IF p_pays_commission AND NOT p_counts_for_career THEN
    RAISE EXCEPTION 'commission_needs_points' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conversion_rules
     SET counts_for_career = p_counts_for_career, pays_commission = p_pays_commission
   WHERE rule_version_id = p_version_id AND category_code = p_category_code AND formula_kind <> 'none';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_update_conversion_flags_draft(uuid, text, boolean, boolean)'::regprocedure);

-- ------------------------------------------------------------
-- 3. VD+ / GM: VD rate is decided, not provisional
-- ------------------------------------------------------------
COMMENT ON COLUMN public.career_levels.appointed_only IS
  'Level reached only by appointment (VD+, GM); never a qualification target, no confirmation year. Their point rate equals VD''s until the management sets one (Profina, 2026-11-21).';

-- ------------------------------------------------------------
-- 4. Confirmation year
-- ------------------------------------------------------------
-- Level history: demotion after a missed confirmation.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_constraint c
     WHERE c.contype = 'c' AND c.conrelid = 'public.career_level_history'::regclass
       AND pg_get_constraintdef(c.oid) LIKE '%admin_correction%'
  LOOP
    EXECUTE format('ALTER TABLE public.career_level_history DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$$;
ALTER TABLE public.career_level_history
  ADD CONSTRAINT career_level_history_source_check CHECK (source IN ('initial', 'promotion', 'admin_correction', 'demotion'));

CREATE TABLE IF NOT EXISTS public.career_confirmations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  promotion_id uuid NOT NULL UNIQUE REFERENCES public.career_level_history (id) ON DELETE RESTRICT,
  decision     text NOT NULL CHECK (decision IN ('kept', 'demoted')),
  demoted_to   text,
  required     numeric(14, 4) NOT NULL,
  achieved     numeric(14, 4) NOT NULL,
  reason       text NOT NULL,
  decided_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_confirmations_demoted_level CHECK ((decision = 'demoted') = (demoted_to IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS career_confirmations_employee_idx ON public.career_confirmations (employee_id);
ALTER TABLE public.career_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_confirmations_admin_read ON public.career_confirmations;
CREATE POLICY career_confirmations_admin_read ON public.career_confirmations
  FOR SELECT TO authenticated USING ((SELECT app_private.has_role('admin')));
REVOKE ALL ON public.career_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.career_confirmations TO authenticated;
SELECT app_private.attach_audit('public.career_confirmations');
DROP TRIGGER IF EXISTS career_confirmations_append_only ON public.career_confirmations;
CREATE TRIGGER career_confirmations_append_only
  BEFORE UPDATE OR DELETE ON public.career_confirmations
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

-- Pure rules (golden-tested against src/domain/confirmation.ts).
CREATE OR REPLACE FUNCTION app_private.confirmation_ratio()
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 0.80::numeric $$;

-- Window: the 12 full calendar months after the promotion month, [start, end).
CREATE OR REPLACE FUNCTION app_private.confirmation_window(p_promoted_on date)
RETURNS daterange
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT daterange((date_trunc('month', p_promoted_on) + interval '1 month')::date,
                   (date_trunc('month', p_promoted_on) + interval '13 months')::date, '[)')
$$;

CREATE OR REPLACE FUNCTION app_private.confirmation_state(
  p_required numeric, p_achieved numeric, p_as_of date, p_window daterange, p_decision text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_decision IS NOT NULL THEN p_decision
    WHEN coalesce(p_achieved, 0) >= p_required THEN 'met'
    WHEN p_as_of >= upper(p_window) THEN 'missed'
    WHEN p_as_of < lower(p_window) THEN 'pending'
    ELSE 'running' END
$$;
REVOKE EXECUTE ON FUNCTION app_private.confirmation_ratio(), app_private.confirmation_window(date),
  app_private.confirmation_state(numeric, numeric, date, daterange, text) FROM PUBLIC, anon, authenticated;

-- Net points (personal + whole structure, no cap) produced in [from, to),
-- structure resolved on the production date like compute_qualification.
CREATE OR REPLACE FUNCTION app_private.career_points_between(p_employee uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_personal  numeric;
  v_structure numeric;
BEGIN
  IF p_to <= p_from THEN RETURN jsonb_build_object('personal', 0, 'structure', 0, 'total', 0); END IF;

  SELECT coalesce(sum(pc.points), 0) INTO v_personal
    FROM public.production_records pr
    JOIN public.point_calculations pc ON pc.production_id = pr.id
   WHERE pr.producer_id = p_employee AND pr.production_date >= p_from AND pr.production_date < p_to;

  WITH bounds AS (
    SELECT p_from AS d
    UNION
    SELECT a.effective_from FROM public.hierarchy_assignments a WHERE a.effective_from > p_from AND a.effective_from < p_to
    UNION
    SELECT a.effective_to FROM public.hierarchy_assignments a WHERE a.effective_to > p_from AND a.effective_to < p_to
  ),
  segments AS (
    SELECT d AS seg_start, lead(d, 1, p_to) OVER (ORDER BY d) AS seg_end FROM bounds
  ),
  members AS (
    SELECT sg.seg_start, sg.seg_end, m.descendant_id
      FROM segments sg
      CROSS JOIN LATERAL app_private.structure_roots_at(p_employee, sg.seg_start) m
  )
  SELECT coalesce(sum(pc.points), 0) INTO v_structure
    FROM members m
    JOIN public.production_records pr
      ON pr.producer_id = m.descendant_id AND pr.production_date >= m.seg_start AND pr.production_date < m.seg_end
    JOIN public.point_calculations pc ON pc.production_id = pr.id;

  RETURN jsonb_build_object('personal', v_personal, 'structure', v_structure, 'total', v_personal + v_structure);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.career_points_between(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- Confirmation of the person's current level, or NULL when none applies
-- (no promotion as the latest level change, appointed level).
CREATE OR REPLACE FUNCTION app_private.confirmation_status(p_employee uuid, p_as_of date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  h          public.career_level_history%ROWTYPE;
  l          public.career_levels%ROWTYPE;
  d          public.career_confirmations%ROWTYPE;
  v_window   daterange;
  v_required numeric;
  v_points   jsonb;
  v_achieved numeric;
  v_prev     text;
  v_state    text;
BEGIN
  SELECT * INTO h FROM public.career_level_history
   WHERE employee_id = p_employee AND effective_from <= p_as_of
   ORDER BY effective_from DESC, created_at DESC LIMIT 1;
  -- A decision always stays visible on the promotion it belongs to.
  SELECT * INTO d FROM public.career_confirmations WHERE promotion_id = h.id;
  IF h.id IS NULL OR (h.source <> 'promotion' AND d.id IS NULL) THEN
    IF h.source = 'demotion' THEN
      SELECT * INTO d FROM public.career_confirmations c
       WHERE c.employee_id = p_employee AND c.decision = 'demoted' ORDER BY c.decided_at DESC LIMIT 1;
      IF d.id IS NOT NULL THEN
        SELECT * INTO h FROM public.career_level_history WHERE id = d.promotion_id;
      ELSE
        RETURN NULL;
      END IF;
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  SELECT * INTO l FROM public.career_levels
   WHERE rule_version_id = app_private.rule_version_at('levels', h.effective_from) AND code = h.level_code;
  IF NOT FOUND OR l.appointed_only THEN RETURN NULL; END IF;

  v_window := app_private.confirmation_window(h.effective_from);
  v_required := round(l.threshold_points * app_private.confirmation_ratio(), 4);
  IF d.id IS NOT NULL THEN
    v_achieved := d.achieved;
    v_points := NULL;
  ELSE
    v_points := app_private.career_points_between(p_employee, lower(v_window), least(p_as_of + 1, upper(v_window)));
    v_achieved := (v_points ->> 'total')::numeric;
  END IF;
  v_prev := app_private.level_at(p_employee, h.effective_from - 1);
  v_state := app_private.confirmation_state(v_required, v_achieved, p_as_of, v_window, d.decision);

  RETURN jsonb_build_object(
    'status', v_state,
    'employee_id', p_employee,
    'promotion_id', h.id,
    'level', h.level_code,
    'previous_level', v_prev,
    'promoted_on', h.effective_from,
    'start', lower(v_window),
    'end', (upper(v_window) - 1),
    'required', v_required,
    'threshold', l.threshold_points,
    'achieved', v_achieved,
    'personal', v_points -> 'personal',
    'structure', v_points -> 'structure',
    'missing', greatest(v_required - v_achieved, 0),
    'decision', d.decision,
    'decided_at', d.decided_at,
    'demoted_to', d.demoted_to);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.confirmation_status(uuid, date) FROM PUBLIC, anon, authenticated;

-- The caller's (or a visible person's) confirmation year.
CREATE OR REPLACE FUNCTION app_rpc.rpc_career_confirmation(p_employee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp uuid := coalesce(p_employee_id, app_private.current_employee_id());
BEGIN
  IF v_emp IS NULL OR NOT app_private.can_see_employee(v_emp) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN app_private.confirmation_status(v_emp, app_private.business_today());
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_career_confirmation(uuid)'::regprocedure);

-- Admin overview: every active person in a confirmation year, missed first.
CREATE OR REPLACE FUNCTION app_rpc.rpc_confirmation_queue()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r   record;
  v_s jsonb;
BEGIN
  PERFORM app_private.assert_admin();
  FOR r IN SELECT e.id, e.first_name || ' ' || e.last_name AS name, e.employee_no
             FROM public.employees e WHERE e.status = 'active' ORDER BY e.last_name, e.first_name LOOP
    v_s := app_private.confirmation_status(r.id, app_private.business_today());
    IF v_s IS NOT NULL AND v_s ->> 'status' IN ('missed', 'running', 'pending', 'met') THEN
      RETURN NEXT v_s || jsonb_build_object('name', r.name, 'employee_no', r.employee_no);
    END IF;
  END LOOP;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_confirmation_queue()'::regprocedure);

-- The management's decision after a missed confirmation year.
CREATE OR REPLACE FUNCTION app_rpc.rpc_decide_confirmation(p_employee_id uuid, p_demote boolean, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text;
  v_s      jsonb;
  v_today  date := app_private.business_today();
BEGIN
  PERFORM app_private.assert_admin();
  v_reason := app_private.require_reason(p_reason);
  IF p_demote IS NULL THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('career_level_history:' || p_employee_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  v_s := app_private.confirmation_status(p_employee_id, v_today);
  IF v_s IS NULL OR v_s ->> 'status' <> 'missed' THEN
    RAISE EXCEPTION 'confirmation_not_missed' USING ERRCODE = 'P0001';
  END IF;
  IF p_demote AND v_s ->> 'previous_level' IS NULL THEN
    RAISE EXCEPTION 'no_previous_level' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.set_audit_context(v_reason);
  INSERT INTO public.career_confirmations (employee_id, promotion_id, decision, demoted_to, required, achieved, reason, decided_by)
  VALUES (p_employee_id, (v_s ->> 'promotion_id')::uuid, CASE WHEN p_demote THEN 'demoted' ELSE 'kept' END,
          CASE WHEN p_demote THEN v_s ->> 'previous_level' END,
          (v_s ->> 'required')::numeric, (v_s ->> 'achieved')::numeric, v_reason, auth.uid());

  IF p_demote THEN
    INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, evidence, reason, approved_by)
    VALUES (p_employee_id, v_s ->> 'previous_level', v_today, 'demotion', v_s, v_reason, auth.uid());
    PERFORM app_private.notify(p_employee_id, 'manual', 'Ihre Karrierestufe wurde angepasst',
      format('Das Bestätigungsjahr wurde nicht erreicht. Neue Stufe ab heute: %s.', v_s ->> 'previous_level'), '/vertrieb/karriere');
  ELSE
    PERFORM app_private.notify(p_employee_id, 'manual', 'Ihre Karrierestufe bleibt bestehen',
      'Die Geschäftsleitung hat entschieden, Ihre Stufe trotz verfehltem Bestätigungsjahr beizubehalten.', '/vertrieb/karriere');
  END IF;
  PERFORM app_private.log_event('career.confirmation', 'public.employees', p_employee_id::text,
    jsonb_build_object('decision', CASE WHEN p_demote THEN 'demoted' ELSE 'kept' END, 'reason', v_reason,
                       'required', v_s -> 'required', 'achieved', v_s -> 'achieved'));
  RETURN CASE WHEN p_demote THEN 'demoted' ELSE 'kept' END;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_decide_confirmation(uuid, boolean, text)'::regprocedure);

-- Review task for the admins when a confirmation year was missed.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check CHECK (type IN (
  'manual', 'goal_review', 'coaching_action', 'coaching_review', 'career_period_end',
  'calculation_exception', 'lead_first_contact', 'lead_next_action', 'lead_unassigned',
  'customer_service', 'customer_follow_up', 'subsidy_review', 'confirmation_review'));

CREATE OR REPLACE FUNCTION app_private.run_confirmation_review_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := app_private.business_today();
  v_keep  uuid[] := '{}';
  v_id    uuid;
  v_n     integer := 0;
  r       record;
  v_s     jsonb;
  a       record;
BEGIN
  FOR r IN SELECT e.id, e.first_name || ' ' || e.last_name AS name FROM public.employees e WHERE e.status = 'active' LOOP
    v_s := app_private.confirmation_status(r.id, v_today);
    CONTINUE WHEN v_s IS NULL OR v_s ->> 'status' <> 'missed';
    FOR a IN SELECT ae.id FROM public.employees ae
               JOIN public.user_roles ur ON ur.user_id = ae.user_id AND ur.role = 'admin' AND ur.revoked_at IS NULL
              WHERE ae.status = 'active' AND ae.id <> r.id LOOP
      v_id := app_private.ensure_system_task('confirmation_review', a.id,
                format('Bestätigungsjahr verfehlt: %s (%s, %s von %s Punkten)', r.name, v_s ->> 'level',
                       replace(to_char((v_s ->> 'achieved')::numeric, 'FM999999990.00'), '.', ','),
                       replace(to_char((v_s ->> 'required')::numeric, 'FM999999990.00'), '.', ',')),
                (v_today + 14)::timestamptz, 'employee', r.id, 'normal', '/admin/befoerderungen');
      v_keep := v_keep || v_id;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  PERFORM app_private.close_system_tasks('confirmation_review', v_keep, 'Über das Bestätigungsjahr entschieden');
  RETURN jsonb_build_object('confirmation_review_open', v_n);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.run_confirmation_review_tasks() FROM PUBLIC, anon, authenticated;

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
  v_confirm   jsonb;
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
  v_confirm   := app_private.run_confirmation_review_tasks();
  PERFORM set_config('app.notify_digest', 'off', true);
  v_sent := app_private.flush_notification_digest();
  RETURN v_core || v_leads || v_customers || v_subsidy || v_confirm
         || jsonb_build_object('auto_assigned', v_auto, 'notifications', v_sent);
END
$$;
