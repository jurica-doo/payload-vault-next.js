-- ============================================================
-- r1/p2/rate-matrix: commission rules (spec §5.2, §5.3, §6.1)
-- ============================================================
-- Gate A is still open for OD-05 (full differential matrix) and OD-10
-- (reserve release/clawback). This migration implements the provisional
-- rules from IMPLEMENTATION_PLAN.md, isolated in one pure function so that a
-- confirmed rule replaces exactly one place:
--
--   personal       points × producer's rate                     (§6.3)
--   differential   "rate compression" (OD-05, provisional): walk up the
--                  producer's chain ON THE PRODUCTION DATE; paid := producer
--                  rate; each ancestor gets max(0, own rate − paid) per point,
--                  then paid := max(paid, own rate). Reproduces §5.3
--                  (FB/FA €28, TL/FB €14, DL/TL €42) and never pays more than
--                  the top rate in total (no duplicate roll-up, §5.4).
--   reserve        10 % of every gross amount, its own component (§6.1/§6.2)
--   rounding       gross = round(points × rate, 2) half-up; reserve =
--                  round(gross × ratio, 2); net = gross − reserve, so the
--                  three always add up.
--
-- The reserve ratio is versioned with the level rules (column on
-- rule_versions, levels kind). Existing published versions get 0.10.
-- app_private.commission_split(...) is mirrored by src/domain/commission.ts
-- and both are tested with the same golden cases (GC-COMM-xxx).
-- ============================================================

ALTER TABLE public.rule_versions
  ADD COLUMN IF NOT EXISTS reserve_ratio numeric(5, 4)
    CHECK (reserve_ratio IS NULL OR (reserve_ratio >= 0 AND reserve_ratio < 1));

-- Backfill for the seeded levels version. ADD COLUMN can't set it on
-- published rows through UPDATE (immutability trigger), so the trigger is
-- bypassed once, deliberately, for this structural backfill only.
ALTER TABLE public.rule_versions DISABLE TRIGGER rule_versions_immutable;
UPDATE public.rule_versions SET reserve_ratio = 0.10 WHERE kind = 'levels' AND reserve_ratio IS NULL;
ALTER TABLE public.rule_versions ENABLE TRIGGER rule_versions_immutable;

ALTER TABLE public.rule_versions
  ADD CONSTRAINT rule_versions_levels_reserve CHECK (kind <> 'levels' OR reserve_ratio IS NOT NULL);

-- New drafts copy the reserve ratio from the version in force.
CREATE OR REPLACE FUNCTION public.rpc_create_rule_draft(p_kind text, p_label text, p_effective_from date)
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

  INSERT INTO public.rule_versions (kind, label, effective_from, ae_per_point, reserve_ratio, created_by)
  SELECT p_kind, btrim(p_label), p_effective_from,
         (SELECT ae_per_point FROM public.rule_versions WHERE id = v_source),
         (SELECT reserve_ratio FROM public.rule_versions WHERE id = v_source),
         auth.uid()
  RETURNING id INTO v_new;

  IF p_kind = 'levels' THEN
    INSERT INTO public.career_levels
      (rule_version_id, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio, structure_cap_ratio)
    SELECT v_new, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio, structure_cap_ratio
      FROM public.career_levels WHERE rule_version_id = v_source;
  ELSE
    INSERT INTO public.conversion_rules
      (rule_version_id, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross)
    SELECT v_new, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross
      FROM public.conversion_rules WHERE rule_version_id = v_source;
  END IF;
  RETURN v_new;
END
$$;

-- Reserve ratio editable in a levels draft.
CREATE OR REPLACE FUNCTION public.rpc_update_reserve_draft(p_version_id uuid, p_reserve_ratio numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  UPDATE public.rule_versions SET reserve_ratio = p_reserve_ratio
   WHERE id = p_version_id AND kind = 'levels' AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_update_reserve_draft(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_reserve_draft(uuid, numeric) TO authenticated;

-- ------------------------------------------------------------
-- Pure split function
-- ------------------------------------------------------------
-- p_chain: ancestors from nearest to furthest, [{"id": "…", "rate": "70"}, …]
--          ("rate": null when the ancestor has no level on the date — the
--          caller turns that into an exception instead of guessing).
-- Returns [{"recipient": id, "type": "personal"|"differential", "depth": n,
--           "rate": r, "gross": g, "reserve": x, "net": n}, …]
CREATE OR REPLACE FUNCTION app_private.commission_split(
  p_points        numeric,
  p_producer_id   text,
  p_producer_rate numeric,
  p_chain         jsonb,
  p_reserve_ratio numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_out   jsonb := '[]'::jsonb;
  v_paid  numeric := p_producer_rate;
  v_item  jsonb;
  v_rate  numeric;
  v_diff  numeric;
  v_gross numeric;
  v_res   numeric;
  v_depth integer := 0;
BEGIN
  IF p_points IS NULL OR p_points = 0 THEN RETURN v_out; END IF;

  v_gross := round(p_points * p_producer_rate, 2);
  v_res := round(v_gross * p_reserve_ratio, 2);
  v_out := v_out || jsonb_build_object('recipient', p_producer_id, 'type', 'personal', 'depth', 0,
             'rate', p_producer_rate, 'gross', v_gross, 'reserve', v_res, 'net', v_gross - v_res);

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_chain, '[]'::jsonb)) LOOP
    v_depth := v_depth + 1;
    v_rate := (v_item ->> 'rate')::numeric;
    CONTINUE WHEN v_rate IS NULL;
    v_diff := v_rate - v_paid;
    IF v_diff > 0 THEN
      v_gross := round(p_points * v_diff, 2);
      v_res := round(v_gross * p_reserve_ratio, 2);
      v_out := v_out || jsonb_build_object('recipient', v_item ->> 'id', 'type', 'differential', 'depth', v_depth,
                 'rate', v_diff, 'gross', v_gross, 'reserve', v_res, 'net', v_gross - v_res);
      v_paid := v_rate;
    END IF;
  END LOOP;
  RETURN v_out;
END
$$;

REVOKE EXECUTE ON FUNCTION app_private.commission_split(numeric, text, numeric, jsonb, numeric) FROM PUBLIC, anon, authenticated;

-- rpc_rules_at now also returns the reserve ratio of the levels version.
CREATE OR REPLACE FUNCTION public.rpc_rules_at(p_date date DEFAULT NULL)
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
