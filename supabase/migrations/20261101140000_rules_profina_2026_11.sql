-- ============================================================
-- Rules "Stand 01.11.2026" from Profina's contract documents
-- ============================================================
-- Source: Profina Tippgebervertrag + Anlage 1 "Provisionssätze" + Anlage 2
-- "Karriereplan", Stand 01.11.2026 (requirements1/OD_ANSWERS_2026-11.md).
-- The versions effective 2026-01-01 stay as they are (historical integrity);
-- production dated from 2026-11-01 uses the new ones.
--
-- Conversion (A2 §4, answers OD-06, OD-07, part of OD-18)
--   rule_versions.divisor_unit = 'ae': AE = round(basis ÷ Absatzteiler, 2)
--   half-up, points (Europunkte) = round(AE ÷ ae_per_point, 4). The old
--   versions keep 'points' (points = basis ÷ divisor, AE = points × 28).
--   LV basis = Beitragssumme (monthly × 12 × term), no term cap.
--   New line Rechtsschutz; Kfz and Rechtsschutz now create AE.
--   conversion_rules.pays_commission = false for Kfz and Rechtsschutz: the
--   contract pays them only as recurring/annual commission, which the
--   commission engine doesn't know yet (E3); "Aus Absatzeinheiten folgt kein
--   Provisionsanspruch" (A2), so their points never book commission per point.
--
-- Levels (A2 §1, §2; answers part of OD-04, OD-15)
--   50 % structure cap on every target level (from FB on).
--   VD+ (code VDP) and GM: appointed by the management, never a qualification
--   target (career_levels.appointed_only). Their point rate equals VD's until
--   Profina sends the full Anlage 1 (OD-05, provisional); threshold column
--   repeats VD's and isn't used.
-- ============================================================

-- ------------------------------------------------------------
-- Structure
-- ------------------------------------------------------------
ALTER TABLE public.rule_versions
  ADD COLUMN IF NOT EXISTS divisor_unit text NOT NULL DEFAULT 'points'
    CHECK (divisor_unit IN ('points', 'ae'));
COMMENT ON COLUMN public.rule_versions.divisor_unit IS
  'conversion versions: points = divisor yields points (AE = points × ae_per_point); ae = divisor is the Absatzteiler (AE = basis ÷ divisor rounded to 2 dp, points = AE ÷ ae_per_point).';

ALTER TABLE public.conversion_rules
  ADD COLUMN IF NOT EXISTS pays_commission boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.conversion_rules.pays_commission IS
  'false: the line creates points/AE for the career but no commission per point (Kfz, Rechtsschutz from 2026-11).';

ALTER TABLE public.career_levels
  ADD COLUMN IF NOT EXISTS appointed_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.career_levels.appointed_only IS
  'Level reached only by appointment (VD+, GM); never a qualification target.';

-- Level codes VDP (VD+) and GM.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
      FROM pg_constraint c
     WHERE c.contype = 'c'
       AND c.conrelid IN ('public.career_levels'::regclass, 'public.career_level_history'::regclass)
       AND pg_get_constraintdef(c.oid) LIKE '%''VD''%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END
$$;
ALTER TABLE public.career_levels
  ADD CONSTRAINT career_levels_code_check
  CHECK (code IN ('FA', 'FB', 'TL', 'OL', 'DL', 'RL', 'VD', 'VDP', 'GM'));
ALTER TABLE public.career_levels DROP CONSTRAINT IF EXISTS career_levels_rank_check;
ALTER TABLE public.career_levels
  ADD CONSTRAINT career_levels_rank_check CHECK (rank BETWEEN 1 AND 9);
ALTER TABLE public.career_level_history
  ADD CONSTRAINT career_level_history_level_code_check
  CHECK (level_code IN ('FA', 'FB', 'TL', 'OL', 'DL', 'RL', 'VD', 'VDP', 'GM'));

INSERT INTO public.product_categories (code, name_de, is_kv, sort)
VALUES ('RS', 'Rechtsschutzversicherung', false, 35)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- The two new versions
-- ------------------------------------------------------------
DO $$
DECLARE
  v_levels uuid;
  v_conv   uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.rule_versions WHERE effective_from = DATE '2026-11-01') THEN
    RETURN;
  END IF;

  PERFORM set_config('app.reason', 'Regeln laut Profina Karriereplan und Provisionssätzen, Stand 01.11.2026', true);

  INSERT INTO public.rule_versions (kind, label, effective_from, reserve_ratio, notes)
  VALUES ('levels', 'Karriereplan (Anlage 2), Stand 01.11.2026', DATE '2026-11-01', 0.10,
          'A2 §1/§2: 50 % clause on every target level; VD+ and GM by appointment. Point rates still provisional (OD-05).')
  RETURNING id INTO v_levels;

  INSERT INTO public.career_levels
    (rule_version_id, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio, structure_cap_ratio, appointed_only)
  VALUES
    (v_levels, 'FA',  1, 'Finanzassistent',      28,  NULL,    0, 0.10, NULL, false),
    (v_levels, 'FB',  2, 'Fachberater',          56,   500,  100, 0.10, 0.50, false),
    (v_levels, 'TL',  3, 'Teamleiter',           70,  1000,  300, 0.10, 0.50, false),
    (v_levels, 'OL',  4, 'Organisationsleiter',  92,  1500,  750, 0.10, 0.50, false),
    (v_levels, 'DL',  5, 'Direktionsleiter',    112,  2500, 1500, 0.10, 0.50, false),
    (v_levels, 'RL',  6, 'Regionalleiter',      132,  3500, 4000, 0.10, 0.50, false),
    (v_levels, 'VD',  7, 'Vertriebsdirektor',   144,  6000, 9000, 0.10, 0.50, false),
    (v_levels, 'VDP', 8, 'Vertriebsdirektor+',  144,  NULL, 9000, 0.10, NULL, true),
    (v_levels, 'GM',  9, 'Generalmanager',      144,  NULL, 9000, 0.10, NULL, true);

  INSERT INTO public.rule_versions (kind, label, effective_from, ae_per_point, divisor_unit, notes)
  VALUES ('conversion', 'Absatzeinheiten (Anlage 2 §4), Stand 01.11.2026', DATE '2026-11-01', 28, 'ae',
          'A2 §4: AE = basis ÷ Absatzteiler, 2 dp; 1 Europunkt = 28 AE. LV basis = Beitragssumme, no term cap.')
  RETURNING id INTO v_conv;

  INSERT INTO public.conversion_rules
    (rule_version_id, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross, pays_commission)
  VALUES
    (v_conv, 'LV',    'lv_monthly_term', 142.86, NULL, 'monthly', NULL,  true),
    (v_conv, 'KV',    'kv_monthly',        1.00, NULL, 'monthly', NULL,  true),
    (v_conv, 'SACH',  'sach_annual_net',   7.15, NULL, 'annual',  'net', true),
    (v_conv, 'RS',    'sach_annual_net',   7.15, NULL, 'annual',  'net', false),
    (v_conv, 'KFZ',   'sach_annual_net',  35.71, NULL, 'annual',  'net', false),
    (v_conv, 'STROM', 'none',              NULL, NULL, NULL,      NULL,  true),
    (v_conv, 'GAS',   'none',              NULL, NULL, NULL,      NULL,  true);

  UPDATE public.rule_versions SET status = 'published', published_at = now()
   WHERE id IN (v_levels, v_conv);
END
$$;

-- ------------------------------------------------------------
-- Points: AE-first for divisor_unit = 'ae'
-- ------------------------------------------------------------
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
  -- Formula text: the old versions keep their wording; AE versions print
  -- factors without trailing zeros, like the TypeScript preview.
  v_div := CASE WHEN v_unit = 'ae' THEN trim_scale(r.divisor)::text ELSE r.divisor::text END;

  IF r.required_premium_period IS NOT NULL AND p_period IS DISTINCT FROM r.required_premium_period THEN
    RETURN jsonb_build_object('ok', false, 'error', 'premium_period_mismatch');
  END IF;
  IF r.required_net_gross IS NOT NULL AND p_net_or_gross IS DISTINCT FROM r.required_net_gross THEN
    RETURN jsonb_build_object('ok', false, 'error', 'net_premium_required');
  END IF;

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

  -- numeric round() is half away from zero; inputs are positive → half-up.
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
      'steps', v_steps,
      'is_kv', v_is_kv));
END
$$;

-- ------------------------------------------------------------
-- Commission: lines without commission per point book nothing
-- ------------------------------------------------------------
-- The booking body stays as it is (renamed); the trigger and
-- rpc_retry_commission call app_private.book_commission by name and now go
-- through this gate. Reversals still mirror whatever the original booked.
ALTER FUNCTION app_private.book_commission(uuid) RENAME TO book_commission_entries;

CREATE OR REPLACE FUNCTION app_private.book_commission(p_calculation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_pays boolean;
BEGIN
  SELECT c.kind, coalesce(cr.pays_commission, true)
    INTO v_kind, v_pays
    FROM public.point_calculations c
    JOIN public.production_records pr ON pr.id = c.production_id
    LEFT JOIN public.conversion_rules cr
      ON cr.rule_version_id = c.rule_version_id AND cr.category_code = pr.category_code
   WHERE c.id = p_calculation_id;
  IF v_kind = 'original' AND NOT v_pays THEN
    RETURN 0;
  END IF;
  RETURN app_private.book_commission_entries(p_calculation_id);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.book_commission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.book_commission_entries(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Career: appointed levels are never a target
-- ------------------------------------------------------------
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
  -- Appointed levels (VD+, GM) are never a qualification target.
  SELECT * INTO v_target FROM public.career_levels WHERE rule_version_id = v_version AND rank = v_current.rank + 1
     AND NOT appointed_only;
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

-- ------------------------------------------------------------
-- Rules RPCs: new columns
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_rules_at(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH d AS (SELECT coalesce(p_date, app_private.business_today()) AS day),
       lv AS (SELECT app_private.rule_version_at('levels', d.day) AS id FROM d),
       cv AS (SELECT app_private.rule_version_at('conversion', d.day) AS id FROM d)
  SELECT jsonb_build_object(
    'date', (SELECT day FROM d),
    'levels', (SELECT jsonb_build_object(
                 'version_id', v.id, 'label', v.label, 'effective_from', v.effective_from,
                 'reserve_ratio', v.reserve_ratio,
                 'rows', (SELECT jsonb_agg(to_jsonb(l) - 'rule_version_id' - 'id' ORDER BY l.rank)
                            FROM public.career_levels l WHERE l.rule_version_id = v.id))
               FROM public.rule_versions v WHERE v.id = (SELECT id FROM lv)),
    'conversion', (SELECT jsonb_build_object(
                 'version_id', v.id, 'label', v.label, 'effective_from', v.effective_from,
                 'ae_per_point', v.ae_per_point,
                 'divisor_unit', v.divisor_unit,
                 'rows', (SELECT jsonb_agg(
                            (to_jsonb(c) - 'rule_version_id' - 'id')
                              || jsonb_build_object('is_kv', pc.is_kv, 'name_de', pc.name_de)
                            ORDER BY pc.sort)
                            FROM public.conversion_rules c
                            JOIN public.product_categories pc ON pc.code = c.category_code
                           WHERE c.rule_version_id = v.id))
               FROM public.rule_versions v WHERE v.id = (SELECT id FROM cv))
  )
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_rules_at(date)'::regprocedure);

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
      (rule_version_id, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio, structure_cap_ratio, appointed_only)
    SELECT v_new, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio, structure_cap_ratio, appointed_only
      FROM public.career_levels WHERE rule_version_id = v_source;
  ELSE
    INSERT INTO public.conversion_rules
      (rule_version_id, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross, pays_commission)
    SELECT v_new, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross, pays_commission
      FROM public.conversion_rules WHERE rule_version_id = v_source;
  END IF;
  RETURN v_new;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_create_rule_draft(text, text, date)'::regprocedure);

-- Publishing a levels version: the seven qualification levels as before
-- (ranks 1–7, FA at 0, thresholds and rates strictly rising); appointed
-- levels may follow on top, with rates and thresholds not below the level
-- under them.
CREATE OR REPLACE FUNCTION app_rpc.rpc_publish_rule_version(p_version_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.rule_versions%ROWTYPE;
  v_latest date;
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);

  SELECT * INTO v FROM public.rule_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'rule_version_immutable' USING ERRCODE = 'P0001'; END IF;

  IF v.effective_from <= app_private.business_today() THEN
    RAISE EXCEPTION 'effective_date_not_future' USING ERRCODE = 'P0001';
  END IF;
  SELECT max(effective_from) INTO v_latest FROM public.rule_versions
   WHERE kind = v.kind AND status = 'published';
  IF v_latest IS NOT NULL AND v.effective_from <= v_latest THEN
    RAISE EXCEPTION 'effective_date_not_after_latest' USING ERRCODE = 'P0001';
  END IF;

  IF v.kind = 'levels' THEN
    IF (SELECT count(*) FROM public.career_levels WHERE rule_version_id = v.id AND NOT appointed_only) <> 7
       OR EXISTS (SELECT 1 FROM public.career_levels WHERE rule_version_id = v.id AND appointed_only AND rank <= 7) THEN
      RAISE EXCEPTION 'levels_incomplete' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT threshold_points FROM public.career_levels WHERE rule_version_id = v.id AND rank = 1) <> 0 THEN
      RAISE EXCEPTION 'levels_entry_threshold' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.career_levels a
        JOIN public.career_levels b ON b.rule_version_id = a.rule_version_id AND b.rank = a.rank + 1
       WHERE a.rule_version_id = v.id
         AND CASE WHEN b.appointed_only
                  THEN b.threshold_points < a.threshold_points OR b.point_rate < a.point_rate
                  ELSE b.threshold_points <= a.threshold_points OR b.point_rate <= a.point_rate END
    ) THEN
      RAISE EXCEPTION 'levels_not_increasing' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.product_categories pc
       WHERE pc.active
         AND NOT EXISTS (SELECT 1 FROM public.conversion_rules c
                          WHERE c.rule_version_id = v.id AND c.category_code = pc.code)
    ) THEN
      RAISE EXCEPTION 'conversion_incomplete' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.rule_versions
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = v.id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_publish_rule_version(uuid, text)'::regprocedure);
