-- ============================================================
-- Profina's final rules (answers of 2026-11-20)
-- ============================================================
-- requirements1/OD_ANSWERS_2026-11.md, section "Final answers".
--
-- Career (OD-01, OD-02, OD-03, OD-04)
--   * Personal year from the start date, then calendar years. The period
--     after the personal year ("transition", up to 31 Dec) counts business
--     from 1 January of that year: start 01.11.2026 → from 01.11.2027 the
--     points from 01.01.2027 count; on 01.01.2028 a new year starts. No
--     rolling 12-month window.
--   * 50 % clause on the strongest structure only; from it at most half of
--     the KV requirement counts, own KV in full (A2 §3d).
--   * Minimum own business (FB 30, TL 60 EP) and a retention rate
--     (Nachhaltigkeitsquote) of at least 90 %:
--     net ÷ (net + cancelled) over the counted business.
--
-- Commission (OD-05, OD-10, OD-12, Ziff. 4–10)
--   * € per EP per level stays (FA 28 … VD 144), differential = rate
--     difference (rate compression, unchanged).
--   * Level, rates and structure on the policy date (Policierungsdatum); a
--     level change counts from the month after it (Ziff. 6). The initial
--     level counts from its own date.
--   * Own contracts (agent is policyholder or insured person) earn no
--     commission; their EP still count for the career (not excluded by the
--     contract).
--   * Cancellation liability 5 years per default (per line,
--     product_categories.cancellation_liability_months): a cancellation
--     after it reverses nothing.
--   * Statements: approved_at on statement_periods for the 8-week objection
--     period and the 10-day debit balance shown to the employee.
-- ============================================================

-- ------------------------------------------------------------
-- Columns
-- ------------------------------------------------------------
ALTER TABLE public.career_levels
  ADD COLUMN IF NOT EXISTS own_min_points numeric(12, 4) CHECK (own_min_points IS NULL OR own_min_points >= 0),
  ADD COLUMN IF NOT EXISTS min_retention_ratio numeric(5, 4)
    CHECK (min_retention_ratio IS NULL OR (min_retention_ratio > 0 AND min_retention_ratio <= 1));
COMMENT ON COLUMN public.career_levels.own_min_points IS 'Minimum own business (EP) to reach this level (Karriereplan: FB 30, TL 60).';
COMMENT ON COLUMN public.career_levels.min_retention_ratio IS 'Minimum Nachhaltigkeitsquote to reach this level (0.90).';

ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS cancellation_liability_months integer NOT NULL DEFAULT 60
    CHECK (cancellation_liability_months > 0);
COMMENT ON COLUMN public.product_categories.cancellation_liability_months IS
  'Stornohaftungszeit in months from the policy date (default 5 years); a cancellation after it reverses nothing.';

ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS policy_date date,
  ADD COLUMN IF NOT EXISTS own_contract boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.production_records.policy_date IS
  'Policierungsdatum, set when the settlement is confirmed; decides level, rates and structure for commission.';
COMMENT ON COLUMN public.production_records.own_contract IS
  'Eigenvertrag (agent is policyholder or insured person): no commission, EP still count.';

ALTER TABLE public.statement_periods
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
COMMENT ON COLUMN public.statement_periods.approved_at IS
  'When the statement was approved (made available): start of the 8-week objection period and the 10-day debit balance.';
UPDATE public.statement_periods SET approved_at = status_changed_at
 WHERE approved_at IS NULL AND status IN ('approved', 'paid');

CREATE OR REPLACE FUNCTION app_private.stamp_statement_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.approved_at := now();
  ELSIF NEW.status IN ('open', 'reviewed') THEN
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.stamp_statement_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS statement_periods_stamp_approval ON public.statement_periods;
CREATE TRIGGER statement_periods_stamp_approval
  BEFORE UPDATE OF status ON public.statement_periods
  FOR EACH ROW EXECUTE FUNCTION app_private.stamp_statement_approval();

-- Requirements of the 2026-11 levels version. Published rows are immutable;
-- this is a structural backfill of new columns with values from the same
-- Karriereplan the version was built from, so the guard is bypassed once.
DO $$
DECLARE v uuid := (SELECT id FROM public.rule_versions WHERE kind = 'levels' AND effective_from = DATE '2026-11-01');
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.reason', 'Karriereplan: Eigenumsatz FB 30 / TL 60, Nachhaltigkeitsquote 90 %', true);
  ALTER TABLE public.career_levels DISABLE TRIGGER career_levels_immutable;
  UPDATE public.career_levels SET own_min_points = 30 WHERE rule_version_id = v AND code = 'FB';
  UPDATE public.career_levels SET own_min_points = 60 WHERE rule_version_id = v AND code = 'TL';
  UPDATE public.career_levels SET min_retention_ratio = 0.90 WHERE rule_version_id = v AND NOT appointed_only AND rank > 1;
  ALTER TABLE public.career_levels ENABLE TRIGGER career_levels_immutable;
END
$$;

-- ------------------------------------------------------------
-- Career periods: counting start
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.period_count_from(p_type text, p_start date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_type = 'transition' THEN date_trunc('year', p_start)::date ELSE p_start END
$$;
REVOKE EXECUTE ON FUNCTION app_private.period_count_from(text, date) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Qualification rules (mirrored by src/domain/qualification.ts)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS app_private.apply_career_rules(numeric, numeric, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION app_private.apply_career_rules(
  p_threshold       numeric,
  p_kv_ratio        numeric,
  p_cap_ratio       numeric,
  p_personal_points numeric,
  p_personal_kv     numeric,
  p_structures      jsonb,
  p_own_min         numeric DEFAULT NULL,
  p_cancelled       numeric DEFAULT 0,
  p_min_retention   numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_kv_required numeric := round(p_threshold * p_kv_ratio, 4);
  v_cap         numeric := CASE WHEN p_cap_ratio IS NULL THEN NULL ELSE p_threshold * p_cap_ratio END;
  v_kv_cap      numeric := CASE WHEN p_cap_ratio IS NULL THEN NULL ELSE round(v_kv_required * p_cap_ratio, 4) END;
  v_pp          numeric := greatest(coalesce(p_personal_points, 0), 0);
  v_pk          numeric := greatest(coalesce(p_personal_kv, 0), 0);
  v_structs     jsonb;
  v_eligible    numeric;
  v_eligible_kv numeric;
  v_gross_all   numeric;
  v_cancelled   numeric := greatest(coalesce(p_cancelled, 0), 0);
  v_settled     numeric;
  v_ratio       numeric;
  v_own_ok      boolean;
  v_ret_ok      boolean;
BEGIN
  -- Structures sorted strongest first; only the strongest one is capped.
  WITH s AS (
    SELECT x ->> 'id' AS id,
           greatest(coalesce((x ->> 'points')::numeric, 0), 0) AS gross,
           greatest(coalesce((x ->> 'kv')::numeric, 0), 0) AS gross_kv
      FROM jsonb_array_elements(coalesce(p_structures, '[]'::jsonb)) x
  ),
  r AS (
    SELECT s.*, row_number() OVER (ORDER BY s.gross DESC, s.id) AS rn FROM s
  ),
  e AS (
    SELECT r.*,
           (r.rn = 1 AND v_cap IS NOT NULL AND r.gross > 0) AS strongest_capped,
           CASE WHEN r.rn = 1 AND v_cap IS NOT NULL THEN least(r.gross, v_cap) ELSE r.gross END AS eligible
      FROM r
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'gross', e.gross, 'gross_kv', e.gross_kv, 'eligible', e.eligible,
           'eligible_kv', CASE WHEN e.strongest_capped THEN least(e.gross_kv, v_kv_cap, e.eligible) ELSE e.gross_kv END,
           'strongest', e.rn = 1 AND e.gross > 0,
           'cap_applied', e.strongest_capped AND e.gross > v_cap,
           'kv_cap_applied', e.strongest_capped AND e.gross_kv > least(v_kv_cap, e.eligible))
         ORDER BY e.rn), '[]'::jsonb),
         coalesce(sum(e.gross), 0)
    INTO v_structs, v_gross_all
    FROM e;

  SELECT v_pp + coalesce(sum((x ->> 'eligible')::numeric), 0),
         v_pk + coalesce(sum((x ->> 'eligible_kv')::numeric), 0)
    INTO v_eligible, v_eligible_kv
    FROM jsonb_array_elements(v_structs) x;

  v_settled := v_pp + v_gross_all + v_cancelled;
  v_ratio := CASE WHEN v_settled > 0 THEN round((v_settled - v_cancelled) / v_settled, 4) END;
  v_own_ok := p_own_min IS NULL OR v_pp >= p_own_min;
  v_ret_ok := p_min_retention IS NULL OR v_ratio IS NULL OR v_ratio >= p_min_retention;

  RETURN jsonb_build_object(
    'required', p_threshold,
    'kv_required', v_kv_required,
    'cap_value', v_cap,
    'kv_cap_value', v_kv_cap,
    'personal', jsonb_build_object('points', v_pp, 'kv', v_pk),
    'structures', v_structs,
    'eligible', v_eligible,
    'eligible_kv', v_eligible_kv,
    'points_missing', greatest(p_threshold - v_eligible, 0),
    'kv_missing', greatest(v_kv_required - v_eligible_kv, 0),
    'own_required', p_own_min,
    'own_missing', CASE WHEN p_own_min IS NULL THEN 0 ELSE greatest(p_own_min - v_pp, 0) END,
    'own_ok', v_own_ok,
    'retention', jsonb_build_object('settled', v_settled, 'cancelled', v_cancelled, 'ratio', v_ratio,
                                    'required', p_min_retention, 'ok', v_ret_ok),
    'is_ready', v_eligible >= p_threshold AND v_eligible_kv >= v_kv_required AND v_own_ok AND v_ret_ok);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.apply_career_rules(numeric, numeric, numeric, numeric, numeric, jsonb, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;

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
  -- After the personal year the rest of that calendar year counts from
  -- 1 January (Profina, 2026-11): app_private.period_count_from.
  v_from := greatest(app_private.period_count_from(v_period.period_type, v_period.start_date),
                     v_level_from + CASE WHEN v_level_source = 'promotion' THEN 1 ELSE 0 END);
  v_to := p_as_of + 1; -- window is [v_from, as_of] inclusive

  -- Personal production
  SELECT coalesce(sum(pc.points), 0) AS points, coalesce(sum(pc.kv_points), 0) AS kv,
         coalesce(sum(CASE WHEN pr.status = 'cancelled' AND pc.kind = 'reversal' THEN -pc.points END), 0) AS storno
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
    SELECT m.root_id, pc.points, pc.kv_points,
           CASE WHEN pr.status = 'cancelled' AND pc.kind = 'reversal' THEN -pc.points ELSE 0 END AS storno
      FROM members m
      JOIN public.production_records pr
        ON pr.producer_id = m.descendant_id
       AND pr.production_date >= m.seg_start AND pr.production_date < m.seg_end
      JOIN public.point_calculations pc ON pc.production_id = pr.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', root_id, 'points', pts, 'kv', kv, 'storno', storno)), '[]'::jsonb)
    INTO v_structs
    FROM (SELECT root_id, sum(points) AS pts, sum(kv_points) AS kv, sum(storno) AS storno FROM attributed GROUP BY root_id) g;

  v_result := app_private.apply_career_rules(
    v_target.threshold_points, v_target.kv_min_ratio, v_target.structure_cap_ratio,
    v_personal.points, v_personal.kv, v_structs,
    v_target.own_min_points,
    v_personal.storno + coalesce((SELECT sum((s ->> 'storno')::numeric) FROM jsonb_array_elements(v_structs) s), 0),
    v_target.min_retention_ratio);

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
-- Commission: level on the policy date, from the month after a change
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.commission_level_at(p_employee uuid, p_date date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT h.level_code
    FROM public.career_level_history h
   CROSS JOIN LATERAL (
     SELECT CASE WHEN h.source = 'initial' THEN h.effective_from
                 ELSE (date_trunc('month', h.effective_from) + interval '1 month')::date END AS applies_from) a
   WHERE h.employee_id = p_employee AND a.applies_from <= p_date
   ORDER BY a.applies_from DESC, h.effective_from DESC, h.created_at DESC
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION app_private.commission_level_at(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.book_commission_entries(p_calculation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  c          public.point_calculations%ROWTYPE;
  pr         public.production_records%ROWTYPE;
  v_period   uuid;
  v_version  uuid;
  v_reserve  numeric;
  v_p_level  text;
  v_p_rate   numeric;
  v_chain    jsonb;
  v_missing  jsonb;
  v_entries  jsonb;
  e          jsonb;
  o          public.commission_ledger%ROWTYPE;
  v_n        integer := 0;
  v_date     date;
BEGIN
  SELECT * INTO c FROM public.point_calculations WHERE id = p_calculation_id;
  SELECT * INTO pr FROM public.production_records WHERE id = c.production_id;
  -- Serialise bookings per calculation.
  PERFORM pg_advisory_xact_lock(hashtext('commission:' || p_calculation_id::text));
  IF EXISTS (SELECT 1 FROM public.commission_ledger WHERE calculation_id = p_calculation_id) THEN
    RETURN 0;
  END IF;

  v_period := app_private.booking_period();

  IF c.kind = 'reversal' THEN
    FOR o IN SELECT * FROM public.commission_ledger WHERE calculation_id = c.reverses_id AND entry_kind = 'original' ORDER BY seq LOOP
      INSERT INTO public.commission_ledger
        (calculation_id, production_id, producer_id, recipient_id, relationship, depth, producer_level, recipient_level,
         commission_type, entry_kind, reverses_entry_id, points, rate_per_point, gross_amount, reserve_amount,
         net_after_reserve, statement_period_id, rule_version_id)
      VALUES
        (c.id, o.production_id, o.producer_id, o.recipient_id, o.relationship, o.depth, o.producer_level, o.recipient_level,
         o.commission_type, 'reversal', o.id, -o.points, o.rate_per_point, -o.gross_amount, -o.reserve_amount,
         -o.net_after_reserve, v_period, o.rule_version_id);
      v_n := v_n + 1;
    END LOOP;
    -- The reversed calculation may never have been booked (open exception).
    UPDATE public.exception_queue
       SET status = 'dismissed', resolved_at = now(), resolution = 'Berechnung wurde storniert'
     WHERE entity_type = 'public.point_calculations' AND entity_id = c.reverses_id::text AND status = 'open';
    RETURN v_n;
  END IF;

  IF c.points = 0 THEN RETURN 0; END IF;

  -- Level, rates and structure on the policy date (Policierungsdatum,
  -- Profina 2026-11); a level change counts for commission from the month
  -- after it (Ziff. 6): app_private.commission_level_at.
  v_date := coalesce(pr.policy_date, pr.production_date);
  v_version := app_private.rule_version_at('levels', v_date);
  SELECT reserve_ratio INTO v_reserve FROM public.rule_versions WHERE id = v_version;
  v_p_level := app_private.commission_level_at(pr.producer_id, v_date);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.ancestor_id,
           'level', app_private.commission_level_at(a.ancestor_id, v_date),
           'rate', (SELECT l.point_rate FROM public.career_levels l
                     WHERE l.rule_version_id = v_version
                       AND l.code = app_private.commission_level_at(a.ancestor_id, v_date)))
         ORDER BY a.depth), '[]'::jsonb)
    INTO v_chain
    FROM app_private.ancestors_at(pr.producer_id, v_date) a;

  -- An ancestor without a level, or whose level has no rate in the version
  -- at the production date, makes the chain uncomputable (§16: don't guess).
  SELECT jsonb_agg(x ->> 'id') INTO v_missing FROM jsonb_array_elements(v_chain) x
   WHERE x ->> 'level' IS NULL OR x ->> 'rate' IS NULL;
  IF v_version IS NOT NULL AND v_p_level IS NOT NULL THEN
    SELECT l.point_rate INTO v_p_rate FROM public.career_levels l WHERE l.rule_version_id = v_version AND l.code = v_p_level;
  END IF;

  IF v_version IS NULL OR v_p_level IS NULL OR v_p_rate IS NULL OR v_missing IS NOT NULL THEN
    PERFORM app_private.raise_exception_item('public.point_calculations', c.id::text,
      CASE WHEN v_version IS NULL THEN 'no_rules_for_date'
           WHEN v_p_level IS NULL THEN 'producer_without_level'
           WHEN v_p_rate IS NULL THEN 'level_without_rate'
           WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_chain) x WHERE x ->> 'level' IS NULL) THEN 'ancestor_without_level'
           ELSE 'level_without_rate' END,
      jsonb_build_object('production_id', pr.id, 'producer_id', pr.producer_id,
                         'production_date', pr.production_date, 'policy_date', v_date, 'missing', v_missing));
    RETURN 0;
  END IF;

  v_entries := app_private.commission_split(c.points, pr.producer_id::text, v_p_rate, v_chain, v_reserve);

  FOR e IN SELECT * FROM jsonb_array_elements(v_entries) LOOP
    INSERT INTO public.commission_ledger
      (calculation_id, production_id, producer_id, recipient_id, relationship, depth, producer_level, recipient_level,
       commission_type, entry_kind, points, rate_per_point, gross_amount, reserve_amount, net_after_reserve,
       statement_period_id, rule_version_id)
    VALUES
      (c.id, pr.id, pr.producer_id, (e ->> 'recipient')::uuid,
       CASE (e ->> 'depth')::int WHEN 0 THEN 'self' WHEN 1 THEN 'direct' ELSE 'indirect' END,
       (e ->> 'depth')::int, v_p_level,
       CASE WHEN (e ->> 'depth')::int = 0 THEN v_p_level
            ELSE (SELECT x ->> 'level' FROM jsonb_array_elements(v_chain) WITH ORDINALITY AS t(x, n)
                   WHERE t.n = (e ->> 'depth')::int) END,
       e ->> 'type', 'original', c.points, (e ->> 'rate')::numeric, (e ->> 'gross')::numeric,
       (e ->> 'reserve')::numeric, (e ->> 'net')::numeric, v_period, v_version);
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.exception_queue
     SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution = 'Provision gebucht'
   WHERE entity_type = 'public.point_calculations' AND entity_id = c.id::text AND status = 'open';
  RETURN v_n;
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.book_commission_entries(uuid) FROM PUBLIC, anon, authenticated;

-- Own contracts and lines without commission per point book nothing.
CREATE OR REPLACE FUNCTION app_private.book_commission(p_calculation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_pays boolean;
  v_own  boolean;
BEGIN
  SELECT c.kind, coalesce(cr.pays_commission, true), pr.own_contract
    INTO v_kind, v_pays, v_own
    FROM public.point_calculations c
    JOIN public.production_records pr ON pr.id = c.production_id
    LEFT JOIN public.conversion_rules cr
      ON cr.rule_version_id = c.rule_version_id AND cr.category_code = pr.category_code
   WHERE c.id = p_calculation_id;
  IF v_kind = 'original' AND (NOT v_pays OR v_own) THEN
    RETURN 0;
  END IF;
  RETURN app_private.book_commission_entries(p_calculation_id);
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.book_commission(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Confirming the settlement: policy date and own contract
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_mark_production_eligible(uuid);
DROP FUNCTION IF EXISTS app_rpc.rpc_mark_production_eligible(uuid);

CREATE OR REPLACE FUNCTION app_rpc.rpc_mark_production_eligible(
  p_id           uuid,
  p_policy_date  date DEFAULT NULL,
  p_own_contract boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    public.production_records%ROWTYPE;
  v_policy date;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  v_policy := coalesce(p_policy_date, v_row.production_date);
  IF v_policy > app_private.business_today() THEN
    RAISE EXCEPTION 'policy_date_in_future' USING ERRCODE = 'P0001';
  END IF;
  IF v_policy < v_row.production_date THEN
    RAISE EXCEPTION 'policy_before_production' USING ERRCODE = 'P0001';
  END IF;

  -- The facts first: the calculation books commission in its insert trigger.
  UPDATE public.production_records
     SET policy_date = v_policy, own_contract = coalesce(p_own_contract, false)
   WHERE id = p_id;
  PERFORM app_private.write_original_calculation(p_id, 'Abrechnung bestätigt');
  UPDATE public.production_records SET status = 'eligible', eligible_at = now() WHERE id = p_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_mark_production_eligible(uuid, date, boolean)'::regprocedure);

-- ------------------------------------------------------------
-- Cancellation: nothing is reversed after the liability period
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_cancel_production(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    public.production_records%ROWTYPE;
  v_reason text;
  v_months integer;
BEGIN
  v_reason := app_private.require_reason(p_reason);
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'cancelled' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  IF v_row.status = 'eligible' THEN
    PERFORM app_private.assert_finance_or_admin();
    SELECT cancellation_liability_months INTO v_months FROM public.product_categories WHERE code = v_row.category_code;
    -- Within the cancellation liability period (Ziff. 4) commission and
    -- points are reversed; after it the commission is earned and stays.
    IF app_private.business_today()
       < (coalesce(v_row.policy_date, v_row.production_date) + make_interval(months => coalesce(v_months, 60)))::date THEN
      PERFORM app_private.reverse_open_calculation(p_id, v_reason);
    END IF;
  ELSE
    PERFORM app_private.assert_can_edit_production(v_row.producer_id);
  END IF;
  UPDATE public.production_records SET status = 'cancelled', cancelled_at = now() WHERE id = p_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_cancel_production(uuid, text)'::regprocedure);

-- ------------------------------------------------------------
-- Rule drafts carry the new level requirements
-- ------------------------------------------------------------
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
      (rule_version_id, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross, pays_commission)
    SELECT v_new, category_code, formula_kind, divisor, max_term_years, required_premium_period, required_net_gross, pays_commission
      FROM public.conversion_rules WHERE rule_version_id = v_source;
  END IF;
  RETURN v_new;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_create_rule_draft(text, text, date)'::regprocedure);

-- Own-business minimum and retention rate are editable in a levels draft.
CREATE OR REPLACE FUNCTION app_rpc.rpc_update_level_requirements_draft(
  p_version_id          uuid,
  p_code                text,
  p_own_min_points      numeric,
  p_min_retention_ratio numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  UPDATE public.career_levels
     SET own_min_points = p_own_min_points, min_retention_ratio = p_min_retention_ratio
   WHERE rule_version_id = p_version_id AND code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_update_level_requirements_draft(uuid, text, numeric, numeric)'::regprocedure);

-- ------------------------------------------------------------
-- v_production: expose policy_date and own_contract
-- ------------------------------------------------------------
-- pr.* was expanded when the view was created, so it is rebuilt (a REPLACE
-- can't insert columns before the existing computed ones). Same grants as
-- before the second sweep tightened them: SELECT only.
DROP VIEW IF EXISTS public.v_production;
CREATE VIEW public.v_production
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

REVOKE ALL ON public.v_production FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_production TO authenticated;
