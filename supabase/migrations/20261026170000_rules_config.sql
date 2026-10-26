-- ============================================================
-- r1/p1/rules-config: versioned business rules + career level history
-- ============================================================
-- Spec §1 "Configurable" and "Historical integrity": rates, thresholds and
-- conversion factors are data with effective dates, never constants in code,
-- and a change never silently rewrites the past.
--
-- rule_versions      one row per rule set (kind 'levels' or 'conversion').
--                    Lifecycle draft → published. Published versions and
--                    their rows are immutable (triggers). The version in
--                    force on a date is the published one with the latest
--                    effective_from <= date.
-- career_levels      7 levels per 'levels' version (§2, §4.4).
-- product_categories identity of a business line; is_kv is fixed per
--                    category (§3.2: KV is explicit, never inferred).
-- conversion_rules   per 'conversion' version and category: formula kind,
--                    divisor, max term, required premium basis (§3).
-- career_level_history  append-only level per employee; levels are
--                    permanent once earned (§2), corrections are explicit.
--
-- Seeds: versions effective 2026-01-01 with the values from the spec.
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rule_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('levels', 'conversion')),
  label          text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  effective_from date NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  ae_per_point   numeric(10, 4) CHECK (ae_per_point IS NULL OR ae_per_point > 0),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  published_at   timestamptz,
  published_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT rule_versions_published_has_date CHECK ((status = 'published') = (published_at IS NOT NULL)),
  CONSTRAINT rule_versions_conversion_ae CHECK (kind <> 'conversion' OR ae_per_point IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_published_date
  ON public.rule_versions (kind, effective_from) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.career_levels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id     uuid NOT NULL REFERENCES public.rule_versions (id) ON DELETE CASCADE,
  code                text NOT NULL CHECK (code IN ('FA', 'FB', 'TL', 'OL', 'DL', 'RL', 'VD')),
  rank                smallint NOT NULL CHECK (rank BETWEEN 1 AND 7),
  name_de             text NOT NULL,
  point_rate          numeric(10, 2) NOT NULL CHECK (point_rate > 0),
  max_subsidy         numeric(10, 2) CHECK (max_subsidy IS NULL OR max_subsidy >= 0),
  threshold_points    numeric(12, 4) NOT NULL CHECK (threshold_points >= 0),
  kv_min_ratio        numeric(5, 4) NOT NULL DEFAULT 0.10 CHECK (kv_min_ratio BETWEEN 0 AND 1),
  structure_cap_ratio numeric(5, 4) CHECK (structure_cap_ratio IS NULL OR structure_cap_ratio > 0 AND structure_cap_ratio <= 1),
  UNIQUE (rule_version_id, code),
  UNIQUE (rule_version_id, rank)
);

CREATE TABLE IF NOT EXISTS public.product_categories (
  code     text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),
  name_de  text NOT NULL,
  is_kv    boolean NOT NULL DEFAULT false,
  active   boolean NOT NULL DEFAULT true,
  sort     smallint NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS public.conversion_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id         uuid NOT NULL REFERENCES public.rule_versions (id) ON DELETE CASCADE,
  category_code           text NOT NULL REFERENCES public.product_categories (code),
  formula_kind            text NOT NULL CHECK (formula_kind IN ('lv_monthly_term', 'kv_monthly', 'sach_annual_net', 'none')),
  divisor                 numeric(12, 4) CHECK (divisor IS NULL OR divisor > 0),
  max_term_years          smallint CHECK (max_term_years IS NULL OR max_term_years > 0),
  required_premium_period text CHECK (required_premium_period IN ('monthly', 'annual')),
  required_net_gross      text CHECK (required_net_gross IN ('net', 'gross')),
  UNIQUE (rule_version_id, category_code),
  CONSTRAINT conversion_divisor_matches CHECK ((formula_kind = 'none') = (divisor IS NULL))
);

CREATE TABLE IF NOT EXISTS public.career_level_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  level_code     text NOT NULL CHECK (level_code IN ('FA', 'FB', 'TL', 'OL', 'DL', 'RL', 'VD')),
  effective_from date NOT NULL,
  source         text NOT NULL CHECK (source IN ('initial', 'promotion', 'admin_correction')),
  evidence       jsonb,
  reason         text,
  approved_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_level_history_employee ON public.career_level_history (employee_id, effective_from DESC, created_at DESC);

SELECT app_private.attach_audit('public.rule_versions');
SELECT app_private.attach_audit('public.career_levels');
SELECT app_private.attach_audit('public.conversion_rules');
SELECT app_private.attach_audit('public.product_categories', 'code');
SELECT app_private.attach_audit('public.career_level_history');

-- ------------------------------------------------------------
-- Immutability
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.guard_published_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'rule_version_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'rule_version_immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN coalesce(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS rule_versions_immutable ON public.rule_versions;
CREATE TRIGGER rule_versions_immutable
  BEFORE UPDATE OR DELETE ON public.rule_versions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_published_version();

-- Rows of a published version can't be added, changed or removed.
CREATE OR REPLACE FUNCTION app_private.guard_published_rows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_version uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.rule_version_id ELSE NEW.rule_version_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.rule_versions v WHERE v.id = v_version AND v.status = 'published')
     OR (TG_OP = 'UPDATE' AND EXISTS (
           SELECT 1 FROM public.rule_versions v WHERE v.id = OLD.rule_version_id AND v.status = 'published')) THEN
    -- Cascading delete of a draft version is fine; a published one can't be deleted at all.
    RAISE EXCEPTION 'rule_version_immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN coalesce(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS career_levels_immutable ON public.career_levels;
CREATE TRIGGER career_levels_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.career_levels
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_published_rows();

DROP TRIGGER IF EXISTS conversion_rules_immutable ON public.conversion_rules;
CREATE TRIGGER conversion_rules_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.conversion_rules
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_published_rows();

-- Level history is append-only.
CREATE OR REPLACE FUNCTION app_private.forbid_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'append_only' USING ERRCODE = '42501', DETAIL = TG_TABLE_NAME;
END
$$;

DROP TRIGGER IF EXISTS career_level_history_append_only ON public.career_level_history;
CREATE TRIGGER career_level_history_append_only
  BEFORE UPDATE OR DELETE ON public.career_level_history
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

-- ------------------------------------------------------------
-- Seeds (spec §2, §3, §4.4)
-- ------------------------------------------------------------
INSERT INTO public.product_categories (code, name_de, is_kv, sort) VALUES
  ('LV',    'Lebensversicherung',        false, 10),
  ('KV',    'Krankenversicherung',       true,  20),
  ('SACH',  'Sachversicherung',          false, 30),
  ('KFZ',   'Kfz-Versicherung',          false, 40),
  ('STROM', 'Strom',                     false, 50),
  ('GAS',   'Gas',                       false, 60)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_levels uuid;
  v_conv   uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.rule_versions) THEN
    RETURN;
  END IF;

  PERFORM set_config('app.reason', 'Startwerte laut Spezifikation v1.0 (25.10.2026)', true);

  INSERT INTO public.rule_versions (kind, label, effective_from, notes)
  VALUES ('levels', 'Karrierestufen laut Spezifikation v1.0', DATE '2026-01-01',
          'Spec §2 and §4.4. Structure cap 50 % on target levels OL and above (provisional, OD-04).')
  RETURNING id INTO v_levels;

  INSERT INTO public.career_levels
    (rule_version_id, code, rank, name_de, point_rate, max_subsidy, threshold_points, kv_min_ratio, structure_cap_ratio)
  VALUES
    (v_levels, 'FA', 1, 'Finanzassistent',     28,  NULL,    0, 0.10, NULL),
    (v_levels, 'FB', 2, 'Fachberater',         56,   500,  100, 0.10, NULL),
    (v_levels, 'TL', 3, 'Teamleiter',          70,  1000,  300, 0.10, NULL),
    (v_levels, 'OL', 4, 'Organisationsleiter', 92,  1500,  750, 0.10, 0.50),
    (v_levels, 'DL', 5, 'Direktionsleiter',   112,  2500, 1500, 0.10, 0.50),
    (v_levels, 'RL', 6, 'Regionalleiter',     132,  3500, 4000, 0.10, 0.50),
    (v_levels, 'VD', 7, 'Vertriebsdirektor',  144,  6000, 9000, 0.10, 0.50);

  INSERT INTO public.rule_versions (kind, label, effective_from, ae_per_point, notes)
  VALUES ('conversion', 'Punkteumrechnung laut Spezifikation v1.0', DATE '2026-01-01', 28,
          'Spec §3. LV term capped at 35 years in the formula (OD-06).')
  RETURNING id INTO v_conv;

  INSERT INTO public.conversion_rules
    (rule_version_id, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross)
  VALUES
    (v_conv, 'LV',    'lv_monthly_term', 4000, 35,   'monthly', NULL),
    (v_conv, 'KV',    'kv_monthly',        28, NULL, 'monthly', NULL),
    (v_conv, 'SACH',  'sach_annual_net',  200, NULL, 'annual',  'net'),
    (v_conv, 'KFZ',   'none',            NULL, NULL, NULL,      NULL),
    (v_conv, 'STROM', 'none',            NULL, NULL, NULL,      NULL),
    (v_conv, 'GAS',   'none',            NULL, NULL, NULL,      NULL);

  UPDATE public.rule_versions SET status = 'published', published_at = now()
   WHERE id IN (v_levels, v_conv);
END
$$;

-- ------------------------------------------------------------
-- Lookups
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.rule_version_at(p_kind text, p_date date)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT v.id FROM public.rule_versions v
   WHERE v.kind = p_kind AND v.status = 'published' AND v.effective_from <= p_date
   ORDER BY v.effective_from DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_private.level_at(p_employee uuid, p_date date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT h.level_code FROM public.career_level_history h
   WHERE h.employee_id = p_employee AND h.effective_from <= p_date
   ORDER BY h.effective_from DESC, h.created_at DESC
   LIMIT 1
$$;

-- Everything the UI and the TypeScript preview engine need for a date.
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

-- ------------------------------------------------------------
-- RLS: everyone in the sales system may read the rules
-- ------------------------------------------------------------
ALTER TABLE public.rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_level_history ENABLE ROW LEVEL SECURITY;

-- Drafts are admin business; published rules are for every employee.
DROP POLICY IF EXISTS rule_versions_select ON public.rule_versions;
CREATE POLICY rule_versions_select ON public.rule_versions FOR SELECT TO authenticated
  USING (status = 'published' OR app_private.has_role('admin'));

DROP POLICY IF EXISTS career_levels_select ON public.career_levels;
CREATE POLICY career_levels_select ON public.career_levels FOR SELECT TO authenticated
  USING (rule_version_id IN (SELECT v.id FROM public.rule_versions v));

DROP POLICY IF EXISTS conversion_rules_select ON public.conversion_rules;
CREATE POLICY conversion_rules_select ON public.conversion_rules FOR SELECT TO authenticated
  USING (rule_version_id IN (SELECT v.id FROM public.rule_versions v));

DROP POLICY IF EXISTS product_categories_select ON public.product_categories;
CREATE POLICY product_categories_select ON public.product_categories FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS career_level_history_select ON public.career_level_history;
CREATE POLICY career_level_history_select ON public.career_level_history FOR SELECT TO authenticated
  USING (employee_id IN (SELECT app_private.visible_employee_ids()));

REVOKE ALL ON public.rule_versions, public.career_levels, public.product_categories,
              public.conversion_rules, public.career_level_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rule_versions, public.career_levels, public.product_categories,
                public.conversion_rules, public.career_level_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rule_versions, public.career_levels, public.product_categories,
                public.conversion_rules, public.career_level_history TO service_role;

-- ------------------------------------------------------------
-- Draft workflow (admin + MFA)
-- ------------------------------------------------------------
-- New draft, copied from the version in force today.
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

  INSERT INTO public.rule_versions (kind, label, effective_from, ae_per_point, created_by)
  SELECT p_kind, btrim(p_label), p_effective_from,
         (SELECT ae_per_point FROM public.rule_versions WHERE id = v_source), auth.uid()
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

CREATE OR REPLACE FUNCTION public.rpc_update_level_draft(
  p_version_id          uuid,
  p_code                text,
  p_point_rate          numeric,
  p_max_subsidy         numeric,
  p_threshold_points    numeric,
  p_kv_min_ratio        numeric,
  p_structure_cap_ratio numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  UPDATE public.career_levels
     SET point_rate = p_point_rate, max_subsidy = p_max_subsidy, threshold_points = p_threshold_points,
         kv_min_ratio = p_kv_min_ratio, structure_cap_ratio = p_structure_cap_ratio
   WHERE rule_version_id = p_version_id AND code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_conversion_draft(
  p_version_id     uuid,
  p_category_code  text,
  p_divisor        numeric,
  p_max_term_years integer,
  p_ae_per_point   numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  -- Only the factors change in a draft; switching a category between "points"
  -- and "no points" is a structural decision (OD-18) and not offered here.
  UPDATE public.conversion_rules
     SET divisor = CASE WHEN formula_kind = 'none' THEN NULL ELSE p_divisor END,
         max_term_years = CASE WHEN formula_kind = 'lv_monthly_term' THEN p_max_term_years ELSE max_term_years END
   WHERE rule_version_id = p_version_id AND category_code = p_category_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_ae_per_point IS NOT NULL THEN
    UPDATE public.rule_versions SET ae_per_point = p_ae_per_point WHERE id = p_version_id AND kind = 'conversion';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_delete_rule_draft(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  DELETE FROM public.rule_versions WHERE id = p_version_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

-- Validates and publishes. No retroactive versions: production and career
-- figures already calculated must not change silently (§1). Changing a past
-- rule needs a recalculation workflow (career-engine / Phase 2).
CREATE OR REPLACE FUNCTION public.rpc_publish_rule_version(p_version_id uuid, p_reason text)
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
    -- Seven levels, ranks 1–7, FA at 0 points, thresholds and rates rising.
    IF (SELECT count(*) FROM public.career_levels WHERE rule_version_id = v.id) <> 7 THEN
      RAISE EXCEPTION 'levels_incomplete' USING ERRCODE = 'P0001';
    END IF;
    IF (SELECT threshold_points FROM public.career_levels WHERE rule_version_id = v.id AND rank = 1) <> 0 THEN
      RAISE EXCEPTION 'levels_entry_threshold' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.career_levels a
        JOIN public.career_levels b ON b.rule_version_id = a.rule_version_id AND b.rank = a.rank + 1
       WHERE a.rule_version_id = v.id
         AND (b.threshold_points <= a.threshold_points OR b.point_rate <= a.point_rate)
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

-- ------------------------------------------------------------
-- Career level history (admin + MFA + reason)
-- ------------------------------------------------------------
-- 'initial' only for an employee without history; 'admin_correction'
-- otherwise. Promotions come from the career engine (promotion requests).
CREATE OR REPLACE FUNCTION public.rpc_set_employee_level(
  p_employee_id    uuid,
  p_level_code     text,
  p_effective_from date,
  p_reason         text
)
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

-- ------------------------------------------------------------
-- Context: current level
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_my_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'user_id',  auth.uid(),
    'aal',      coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'employee', (SELECT jsonb_build_object(
                    'id', e.id, 'first_name', e.first_name, 'last_name', e.last_name,
                    'status', e.status,
                    'level_code', app_private.level_at(e.id, app_private.business_today()))
                   FROM public.employees e WHERE e.user_id = auth.uid()),
    'roles',    coalesce((SELECT jsonb_agg(r.role ORDER BY r.role)
                            FROM public.user_roles r
                           WHERE r.user_id = auth.uid() AND r.revoked_at IS NULL), '[]'::jsonb),
    'descendant_count', coalesce((
                    SELECT count(*)::int FROM app_private.descendants_at(
                      app_private.current_employee_id(), app_private.business_today())), 0),
    'feature_flags', coalesce(
                       (SELECT s.value FROM public.app_settings s WHERE s.key = 'feature_flags'),
                       '{}'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_rules_at(date),
  public.rpc_create_rule_draft(text, text, date),
  public.rpc_update_level_draft(uuid, text, numeric, numeric, numeric, numeric, numeric),
  public.rpc_update_conversion_draft(uuid, text, numeric, integer, numeric),
  public.rpc_delete_rule_draft(uuid),
  public.rpc_publish_rule_version(uuid, text),
  public.rpc_set_employee_level(uuid, text, date, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.rpc_rules_at(date),
  public.rpc_create_rule_draft(text, text, date),
  public.rpc_update_level_draft(uuid, text, numeric, numeric, numeric, numeric, numeric),
  public.rpc_update_conversion_draft(uuid, text, numeric, integer, numeric),
  public.rpc_delete_rule_draft(uuid),
  public.rpc_publish_rule_version(uuid, text),
  public.rpc_set_employee_level(uuid, text, date, text)
TO authenticated;
