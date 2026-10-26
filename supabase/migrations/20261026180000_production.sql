-- ============================================================
-- r1/p1/production: production records, points engine, CSV import
-- ============================================================
-- Spec §3 (points/AE), §13.2 (raw inputs separate from calculated values,
-- ledger-style corrections), §14.1 (acceptance criteria).
--
-- production_records   raw business facts. Lifecycle:
--                        draft → submitted → eligible → cancelled
--                      Points are calculated only when a record becomes
--                      eligible (OD-08: the milestone is set manually by
--                      admin/finance until Profina decides otherwise).
-- point_calculations   append-only ledger per record:
--                        original  (+points) when it becomes eligible
--                        reversal  (−points) on cancellation or correction
--                      Current points of a record = SUM over its rows.
--                      Each row stores rule version, inputs, formula and
--                      steps, so every number is explainable (§1, §14.1).
-- app_private.calculate_points(...)  the single SQL implementation of the
--                      formulas. src/domain/points.ts mirrors it for live
--                      previews; both are tested against the same golden
--                      cases (GC-POINTS-xxx).
--
-- Rounding (OD-07, provisional): points rounded half-up to 4 decimals once;
-- AE = rounded points × ae_per_point, rounded to 4 decimals. So AE is always
-- exactly points × 28 as stored, and sums reconcile.
--
-- Import: rows are staged and validated first (import_rows), then valid rows
-- are committed as 'submitted' records. Duplicates are refused by
-- (source_system, source_system_id).
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('production')),
  source_system  text NOT NULL CHECK (length(btrim(source_system)) BETWEEN 1 AND 60),
  file_name      text,
  status         text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'committed', 'discarded')),
  row_count      integer NOT NULL DEFAULT 0,
  valid_count    integer NOT NULL DEFAULT 0,
  committed_count integer NOT NULL DEFAULT 0,
  created_by     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  committed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS public.production_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id       uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  category_code     text NOT NULL REFERENCES public.product_categories (code),
  product_reference text CHECK (product_reference IS NULL OR length(product_reference) <= 120),
  premium_amount    numeric(12, 2) NOT NULL CHECK (premium_amount > 0),
  premium_period    text NOT NULL CHECK (premium_period IN ('monthly', 'annual', 'one_off')),
  net_or_gross      text CHECK (net_or_gross IN ('net', 'gross')),
  currency          char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  term_years        numeric(5, 2) CHECK (term_years IS NULL OR term_years > 0),
  production_date   date NOT NULL,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'eligible', 'cancelled')),
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
  source_system     text,
  source_system_id  text,
  import_batch_id   uuid REFERENCES public.import_batches (id) ON DELETE SET NULL,
  notes             text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  eligible_at       timestamptz,
  cancelled_at      timestamptz,
  CONSTRAINT production_source_pair CHECK ((source_system IS NULL) = (source_system_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_source_unique
  ON public.production_records (source_system, source_system_id) WHERE source_system IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_producer_date ON public.production_records (producer_id, production_date);
CREATE INDEX IF NOT EXISTS idx_production_status ON public.production_records (status);

CREATE TABLE IF NOT EXISTS public.point_calculations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ledger order: rows written in one transaction share now(), so time alone
  -- can't order an original before its reversal.
  seq             bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  production_id   uuid NOT NULL REFERENCES public.production_records (id) ON DELETE RESTRICT,
  kind            text NOT NULL CHECK (kind IN ('original', 'reversal')),
  reverses_id     uuid REFERENCES public.point_calculations (id),
  rule_version_id uuid REFERENCES public.rule_versions (id),
  points          numeric(14, 4) NOT NULL,
  ae              numeric(16, 4) NOT NULL,
  kv_points       numeric(14, 4) NOT NULL,
  details         jsonb NOT NULL,
  reason          text,
  calculated_at   timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT point_calc_reversal_link CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL))
);

-- An original can be reversed at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_point_calc_single_reversal ON public.point_calculations (reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_point_calc_production ON public.point_calculations (production_id);

CREATE TABLE IF NOT EXISTS public.import_rows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL REFERENCES public.import_batches (id) ON DELETE CASCADE,
  row_number    integer NOT NULL,
  raw           jsonb NOT NULL,
  errors        text[] NOT NULL DEFAULT '{}',
  production_id uuid REFERENCES public.production_records (id) ON DELETE SET NULL,
  UNIQUE (batch_id, row_number)
);

DROP TRIGGER IF EXISTS production_touch ON public.production_records;
CREATE TRIGGER production_touch BEFORE UPDATE ON public.production_records
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

DROP TRIGGER IF EXISTS point_calculations_append_only ON public.point_calculations;
CREATE TRIGGER point_calculations_append_only
  BEFORE UPDATE OR DELETE ON public.point_calculations
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

SELECT app_private.attach_audit('public.production_records');
SELECT app_private.attach_audit('public.import_batches');

-- ------------------------------------------------------------
-- Points engine
-- ------------------------------------------------------------
-- Returns either
--   {"ok": true, "points": "10.5000", "ae": "294.0000", "kv_points": "0.0000",
--    "rule_version_id": …, "details": {…}}
-- or
--   {"ok": false, "error": "<machine key>"}
-- Never raises for business validation, so imports can collect errors.
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
  r          public.conversion_rules%ROWTYPE;
  v_is_kv    boolean;
  v_exact    numeric;
  v_points   numeric;
  v_term     numeric;
  v_capped   boolean := false;
  v_formula  text;
  v_steps    jsonb := '[]'::jsonb;
BEGIN
  IF v_version IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_rules_for_date'); END IF;
  IF p_premium IS NULL OR p_premium <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'premium_must_be_positive'); END IF;
  IF coalesce(p_currency, 'EUR') <> 'EUR' THEN RETURN jsonb_build_object('ok', false, 'error', 'currency_not_supported'); END IF;

  SELECT * INTO r FROM public.conversion_rules c WHERE c.rule_version_id = v_version AND c.category_code = p_category;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown_category'); END IF;
  SELECT pc.is_kv INTO v_is_kv FROM public.product_categories pc WHERE pc.code = p_category;
  SELECT v.ae_per_point INTO v_ae_rate FROM public.rule_versions v WHERE v.id = v_version;

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
      v_exact := p_premium * 12 * v_term / r.divisor;
      v_formula := format('%s × 12 × %s ÷ %s', p_premium, v_term, r.divisor);
      v_steps := jsonb_build_array(jsonb_build_object('label', 'Beitragssumme', 'value', (p_premium * 12 * v_term)::text));
    WHEN 'kv_monthly' THEN
      v_exact := p_premium / r.divisor;
      v_formula := format('%s ÷ %s', p_premium, r.divisor);
    WHEN 'sach_annual_net' THEN
      v_exact := p_premium / r.divisor;
      v_formula := format('%s ÷ %s', p_premium, r.divisor);
    ELSE
      v_exact := 0;
      v_formula := 'keine Punkte für diese Sparte';
  END CASE;

  v_points := round(v_exact, 4);  -- numeric round() is half away from zero; inputs are positive → half-up

  RETURN jsonb_build_object(
    'ok', true,
    'points', v_points::text,
    'ae', round(v_points * v_ae_rate, 4)::text,
    'kv_points', (CASE WHEN v_is_kv THEN v_points ELSE 0 END)::numeric(14, 4)::text,
    'rule_version_id', v_version,
    'details', jsonb_build_object(
      'category', p_category,
      'formula_kind', r.formula_kind,
      'formula', v_formula,
      'inputs', jsonb_build_object('premium', p_premium::text, 'period', p_period, 'net_or_gross', p_net_or_gross,
                                   'term_years', p_term_years::text, 'production_date', p_production_day),
      'divisor', r.divisor::text,
      'term_used', v_term::text,
      'term_capped', v_capped,
      'exact_points', v_exact::text,
      'ae_per_point', v_ae_rate::text,
      'steps', v_steps,
      'is_kv', v_is_kv));
END
$$;

-- Live, authoritative preview for forms (no write).
CREATE OR REPLACE FUNCTION public.rpc_preview_points(
  p_category text, p_premium numeric, p_period text, p_net_or_gross text,
  p_currency text, p_term_years numeric, p_production_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.calculate_points(p_category, p_premium, p_period, p_net_or_gross,
                                      p_currency, p_term_years, p_production_date)
   WHERE app_private.current_employee_id() IS NOT NULL OR app_private.has_role('admin')
$$;

-- ------------------------------------------------------------
-- Permissions helpers
-- ------------------------------------------------------------
-- Who may enter production for a producer: the producer themselves, or an
-- admin with MFA. (Leaders entering for their team is a later decision.)
CREATE OR REPLACE FUNCTION app_private.assert_can_edit_production(p_producer uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_producer = app_private.current_employee_id() THEN RETURN; END IF;
  PERFORM app_private.assert_admin();
END
$$;

-- Eligibility and corrections: admin or finance, with MFA.
CREATE OR REPLACE FUNCTION app_private.assert_finance_or_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('finance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.is_aal2() THEN
    RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501';
  END IF;
END
$$;

-- Validates a record's facts against the producer and the rules.
CREATE OR REPLACE FUNCTION app_private.validate_production(p public.production_records)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
BEGIN
  SELECT * INTO v_emp FROM public.employees WHERE id = p.producer_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown_producer'); END IF;
  IF p.production_date < v_emp.start_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'before_producer_start');
  END IF;
  IF v_emp.deactivated_at IS NOT NULL AND p.production_date > (v_emp.deactivated_at AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'after_producer_deactivation');
  END IF;
  IF p.production_date > app_private.business_today() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'production_date_in_future');
  END IF;
  RETURN app_private.calculate_points(p.category_code, p.premium_amount, p.premium_period,
                                      p.net_or_gross, p.currency, p.term_years, p.production_date);
END
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_select ON public.production_records;
CREATE POLICY production_select ON public.production_records FOR SELECT TO authenticated
  USING (producer_id IN (SELECT app_private.visible_employee_ids()));

DROP POLICY IF EXISTS point_calc_select ON public.point_calculations;
CREATE POLICY point_calc_select ON public.point_calculations FOR SELECT TO authenticated
  USING (production_id IN (SELECT pr.id FROM public.production_records pr));

DROP POLICY IF EXISTS import_batches_select ON public.import_batches;
CREATE POLICY import_batches_select ON public.import_batches FOR SELECT TO authenticated
  USING (app_private.has_role('admin'));

DROP POLICY IF EXISTS import_rows_select ON public.import_rows;
CREATE POLICY import_rows_select ON public.import_rows FOR SELECT TO authenticated
  USING (app_private.has_role('admin'));

REVOKE ALL ON public.production_records, public.point_calculations, public.import_batches, public.import_rows
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_records, public.point_calculations, public.import_batches, public.import_rows
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_records, public.point_calculations,
  public.import_batches, public.import_rows TO service_role;

-- Records with their current totals (RLS of the caller applies).
CREATE OR REPLACE VIEW public.v_production
WITH (security_invoker = true) AS
SELECT pr.*,
       e.first_name AS producer_first_name,
       e.last_name  AS producer_last_name,
       coalesce(sum(pc.points), 0)    AS points,
       coalesce(sum(pc.ae), 0)        AS ae,
       coalesce(sum(pc.kv_points), 0) AS kv_points
  FROM public.production_records pr
  JOIN public.employees e ON e.id = pr.producer_id
  LEFT JOIN public.point_calculations pc ON pc.production_id = pr.id
 GROUP BY pr.id, e.first_name, e.last_name;

REVOKE ALL ON public.v_production FROM PUBLIC, anon;
GRANT SELECT ON public.v_production TO authenticated;

-- ------------------------------------------------------------
-- RPCs: entry and lifecycle
-- ------------------------------------------------------------
-- Creates (p_id NULL) or updates a draft. Validates fully; refuses with the
-- engine's machine key so the form can show the right message.
CREATE OR REPLACE FUNCTION public.rpc_save_production(
  p_id                uuid,
  p_producer_id       uuid,
  p_category_code     text,
  p_premium_amount    numeric,
  p_premium_period    text,
  p_net_or_gross      text,
  p_term_years        numeric,
  p_production_date   date,
  p_product_reference text DEFAULT NULL,
  p_notes             text DEFAULT NULL,
  p_currency          text DEFAULT 'EUR'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   public.production_records%ROWTYPE;
  v_check jsonb;
BEGIN
  PERFORM app_private.assert_can_edit_production(p_producer_id);

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    PERFORM app_private.assert_can_edit_production(v_row.producer_id);
    IF v_row.status <> 'draft' THEN RAISE EXCEPTION 'not_editable' USING ERRCODE = 'P0001'; END IF;
  END IF;

  v_row.producer_id := p_producer_id;
  v_row.category_code := p_category_code;
  v_row.premium_amount := p_premium_amount;
  v_row.premium_period := p_premium_period;
  v_row.net_or_gross := p_net_or_gross;
  v_row.term_years := p_term_years;
  v_row.production_date := p_production_date;
  v_row.currency := upper(coalesce(p_currency, 'EUR'));

  v_check := app_private.validate_production(v_row);
  IF NOT (v_check ->> 'ok')::boolean THEN
    RAISE EXCEPTION '%', v_check ->> 'error' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.production_records
      (producer_id, category_code, premium_amount, premium_period, net_or_gross, currency, term_years,
       production_date, product_reference, notes, created_by)
    VALUES
      (p_producer_id, p_category_code, p_premium_amount, p_premium_period, p_net_or_gross, v_row.currency,
       p_term_years, p_production_date, nullif(btrim(coalesce(p_product_reference, '')), ''),
       nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
    RETURNING id INTO v_row.id;
  ELSE
    UPDATE public.production_records
       SET producer_id = p_producer_id, category_code = p_category_code, premium_amount = p_premium_amount,
           premium_period = p_premium_period, net_or_gross = p_net_or_gross, currency = v_row.currency,
           term_years = p_term_years, production_date = p_production_date,
           product_reference = nullif(btrim(coalesce(p_product_reference, '')), ''),
           notes = nullif(btrim(coalesce(p_notes, '')), '')
     WHERE id = p_id;
  END IF;
  RETURN v_row.id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_submit_production(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.production_records%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.assert_can_edit_production(v_row.producer_id);
  IF v_row.status <> 'draft' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.production_records SET status = 'submitted' WHERE id = p_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_delete_production_draft(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.production_records%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.assert_can_edit_production(v_row.producer_id);
  IF v_row.status <> 'draft' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.production_records WHERE id = p_id;
END
$$;

-- Writes an 'original' calculation for the record's current facts.
CREATE OR REPLACE FUNCTION app_private.write_original_calculation(p_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   public.production_records%ROWTYPE;
  v_calc  jsonb;
  v_id    uuid;
BEGIN
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id;
  v_calc := app_private.validate_production(v_row);
  IF NOT (v_calc ->> 'ok')::boolean THEN
    RAISE EXCEPTION '%', v_calc ->> 'error' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.point_calculations
    (production_id, kind, rule_version_id, points, ae, kv_points, details, reason, created_by)
  VALUES
    (p_id, 'original', (v_calc ->> 'rule_version_id')::uuid, (v_calc ->> 'points')::numeric,
     (v_calc ->> 'ae')::numeric, (v_calc ->> 'kv_points')::numeric, v_calc -> 'details', p_reason, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Reverses the open original (if any) with an exact negative mirror.
CREATE OR REPLACE FUNCTION app_private.reverse_open_calculation(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o public.point_calculations%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.point_calculations pc
   WHERE pc.production_id = p_id AND pc.kind = 'original'
     AND NOT EXISTS (SELECT 1 FROM public.point_calculations r WHERE r.reverses_id = pc.id);
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.point_calculations
    (production_id, kind, reverses_id, rule_version_id, points, ae, kv_points, details, reason, created_by)
  VALUES
    (p_id, 'reversal', o.id, o.rule_version_id, -o.points, -o.ae, -o.kv_points,
     jsonb_build_object('reverses', o.id), p_reason, auth.uid());
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_production_eligible(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.production_records%ROWTYPE;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.write_original_calculation(p_id, 'Als anrechenbar markiert');
  UPDATE public.production_records SET status = 'eligible', eligible_at = now() WHERE id = p_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_production(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    public.production_records%ROWTYPE;
  v_reason text;
BEGIN
  v_reason := app_private.require_reason(p_reason);
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'cancelled' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  IF v_row.status = 'eligible' THEN
    PERFORM app_private.assert_finance_or_admin();
    PERFORM app_private.reverse_open_calculation(p_id, v_reason);
  ELSE
    PERFORM app_private.assert_can_edit_production(v_row.producer_id);
  END IF;
  UPDATE public.production_records SET status = 'cancelled', cancelled_at = now() WHERE id = p_id;
END
$$;

-- Correction of an eligible record: reversal of the open calculation, new
-- facts, new original. History of both calculations stays.
CREATE OR REPLACE FUNCTION public.rpc_correct_production(
  p_id              uuid,
  p_premium_amount  numeric,
  p_premium_period  text,
  p_net_or_gross    text,
  p_term_years      numeric,
  p_production_date date,
  p_reason          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    public.production_records%ROWTYPE;
  v_reason text;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  v_reason := app_private.require_reason(p_reason);
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'eligible' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  PERFORM app_private.reverse_open_calculation(p_id, v_reason);
  UPDATE public.production_records
     SET premium_amount = p_premium_amount, premium_period = p_premium_period, net_or_gross = p_net_or_gross,
         term_years = p_term_years, production_date = p_production_date
   WHERE id = p_id;
  PERFORM app_private.write_original_calculation(p_id, v_reason);
END
$$;

-- ------------------------------------------------------------
-- RPCs: CSV import (admin + MFA)
-- ------------------------------------------------------------
-- p_rows: JSON array of objects with keys
--   source_id, employee_no, category, premium, period, net_or_gross,
--   term_years, production_date, reference, currency
-- (the browser parses the CSV; numbers arrive as plain decimal strings).
CREATE OR REPLACE FUNCTION public.rpc_stage_production_import(p_source_system text, p_file_name text, p_rows jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch  uuid;
  v_item   jsonb;
  v_n      integer := 0;
  v_valid  integer := 0;
  v_errors text[];
  v_emp    uuid;
  v_row    public.production_records%ROWTYPE;
  v_check  jsonb;
  v_seen   text[] := '{}';
  v_src    text;
BEGIN
  PERFORM app_private.assert_admin();
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_rows) > 5000 THEN RAISE EXCEPTION 'too_many_rows' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.import_batches (kind, source_system, file_name, created_by)
  VALUES ('production', btrim(p_source_system), p_file_name, auth.uid())
  RETURNING id INTO v_batch;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_n := v_n + 1;
    v_errors := '{}';
    v_src := nullif(btrim(v_item ->> 'source_id'), '');

    IF v_src IS NULL THEN
      v_errors := array_append(v_errors, 'source_id_required');
    ELSIF v_src = ANY (v_seen) THEN
      v_errors := array_append(v_errors, 'duplicate_in_file');
    ELSIF EXISTS (SELECT 1 FROM public.production_records pr
                   WHERE pr.source_system = btrim(p_source_system) AND pr.source_system_id = v_src) THEN
      v_errors := array_append(v_errors, 'already_imported');
    END IF;
    v_seen := v_seen || v_src;

    SELECT e.id INTO v_emp FROM public.employees e WHERE e.employee_no = upper(btrim(v_item ->> 'employee_no'));
    IF v_emp IS NULL THEN v_errors := array_append(v_errors, 'unknown_employee_no'); END IF;

    BEGIN
      v_row.producer_id := v_emp;
      v_row.category_code := upper(btrim(v_item ->> 'category'));
      v_row.premium_amount := (v_item ->> 'premium')::numeric(12, 2);
      v_row.premium_period := lower(btrim(v_item ->> 'period'));
      v_row.net_or_gross := nullif(lower(btrim(coalesce(v_item ->> 'net_or_gross', ''))), '');
      v_row.term_years := nullif(btrim(coalesce(v_item ->> 'term_years', '')), '')::numeric;
      v_row.production_date := (v_item ->> 'production_date')::date;
      v_row.currency := upper(coalesce(nullif(btrim(v_item ->> 'currency'), ''), 'EUR'));
      IF v_emp IS NOT NULL THEN
        v_check := app_private.validate_production(v_row);
        IF NOT (v_check ->> 'ok')::boolean THEN v_errors := array_append(v_errors, v_check ->> 'error'); END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format
                   OR numeric_value_out_of_range THEN
      v_errors := array_append(v_errors, 'invalid_value');
    END;

    INSERT INTO public.import_rows (batch_id, row_number, raw, errors) VALUES (v_batch, v_n, v_item, v_errors);
    IF cardinality(v_errors) = 0 THEN v_valid := v_valid + 1; END IF;
  END LOOP;

  UPDATE public.import_batches SET row_count = v_n, valid_count = v_valid WHERE id = v_batch;
  RETURN v_batch;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_commit_production_import(p_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  b       public.import_batches%ROWTYPE;
  r       public.import_rows%ROWTYPE;
  v_id    uuid;
  v_count integer := 0;
BEGIN
  PERFORM app_private.assert_admin();
  SELECT * INTO b FROM public.import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF b.status <> 'staged' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  -- One correlation id for the whole batch in the audit trail.
  PERFORM app_private.set_audit_context(format('Import %s (%s)', b.source_system, coalesce(b.file_name, '–')), b.id);

  FOR r IN SELECT * FROM public.import_rows WHERE batch_id = p_batch_id AND cardinality(errors) = 0 ORDER BY row_number LOOP
    INSERT INTO public.production_records
      (producer_id, category_code, premium_amount, premium_period, net_or_gross, currency, term_years,
       production_date, product_reference, status, source, source_system, source_system_id, import_batch_id, created_by)
    SELECT e.id, upper(btrim(r.raw ->> 'category')), (r.raw ->> 'premium')::numeric(12, 2),
           lower(btrim(r.raw ->> 'period')), nullif(lower(btrim(coalesce(r.raw ->> 'net_or_gross', ''))), ''),
           upper(coalesce(nullif(btrim(r.raw ->> 'currency'), ''), 'EUR')),
           nullif(btrim(coalesce(r.raw ->> 'term_years', '')), '')::numeric,
           (r.raw ->> 'production_date')::date, nullif(btrim(coalesce(r.raw ->> 'reference', '')), ''),
           'submitted', 'import', b.source_system, btrim(r.raw ->> 'source_id'), b.id, auth.uid()
      FROM public.employees e WHERE e.employee_no = upper(btrim(r.raw ->> 'employee_no'))
    ON CONFLICT (source_system, source_system_id) WHERE source_system IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      UPDATE public.import_rows SET production_id = v_id WHERE id = r.id;
      v_count := v_count + 1;
    END IF;
    v_id := NULL;
  END LOOP;

  UPDATE public.import_batches
     SET status = 'committed', committed_count = v_count, committed_at = now()
   WHERE id = p_batch_id;
  RETURN v_count;
END
$$;

-- ------------------------------------------------------------
-- Audit read access for production records
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_read_audit(p_entity_type text, p_entity_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.has_role('admin') OR app_private.has_role('compliance') THEN
    RETURN true;
  END IF;
  IF p_entity_type = 'public.employees' THEN
    RETURN p_entity_id::uuid = app_private.current_employee_id();
  END IF;
  IF p_entity_type = 'public.production_records' THEN
    RETURN EXISTS (SELECT 1 FROM public.production_records pr
                    WHERE pr.id = p_entity_id::uuid
                      AND pr.producer_id IN (SELECT app_private.visible_employee_ids()));
  END IF;
  RETURN false;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_preview_points(text, numeric, text, text, text, numeric, date),
  public.rpc_save_production(uuid, uuid, text, numeric, text, text, numeric, date, text, text, text),
  public.rpc_submit_production(uuid),
  public.rpc_delete_production_draft(uuid),
  public.rpc_mark_production_eligible(uuid),
  public.rpc_cancel_production(uuid, text),
  public.rpc_correct_production(uuid, numeric, text, text, numeric, date, text),
  public.rpc_stage_production_import(text, text, jsonb),
  public.rpc_commit_production_import(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.rpc_preview_points(text, numeric, text, text, text, numeric, date),
  public.rpc_save_production(uuid, uuid, text, numeric, text, text, numeric, date, text, text, text),
  public.rpc_submit_production(uuid),
  public.rpc_delete_production_draft(uuid),
  public.rpc_mark_production_eligible(uuid),
  public.rpc_cancel_production(uuid, text),
  public.rpc_correct_production(uuid, numeric, text, text, numeric, date, text),
  public.rpc_stage_production_import(text, text, jsonb),
  public.rpc_commit_production_import(uuid)
TO authenticated;
