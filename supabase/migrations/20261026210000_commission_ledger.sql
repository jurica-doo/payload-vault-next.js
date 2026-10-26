-- ============================================================
-- r1/p2/ledger: commission ledger, booking, exception queue
-- ============================================================
-- Spec §5.4, §6.1–6.3, §13.2 ("use a ledger model for commissions").
--
-- statement_periods  one row per month (first day). Bookings go to the first
--                    month from the current one (Berlin) whose status is
--                    'open'; reviewed/approved/paid months take no new
--                    entries (statements slice manages the status).
-- commission_ledger  append-only. One entry per calculation × recipient ×
--                    type (unique → no duplicate roll-up, §5.4). Stores the
--                    levels and rate actually applied, gross, reserve and
--                    net after reserve as separate components (§6.2).
-- exception_queue    anything that can't be calculated confidently goes
--                    here for authorised review instead of a default (§11.2,
--                    §16). First users: producer or ancestor without a level.
--
-- Booking runs in an AFTER INSERT trigger on point_calculations, so points
-- and commission are written in the same transaction:
--   original calc  → split with app_private.commission_split using the
--                    hierarchy, levels and level rates ON THE PRODUCTION DATE
--   reversal calc  → exact negative mirror of the reversed calculation's
--                    entries, booked in the current open month
-- ============================================================

CREATE TABLE IF NOT EXISTS public.statement_periods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month      date NOT NULL UNIQUE CHECK (extract(day FROM period_month) = 1),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'approved', 'paid')),
  status_changed_at timestamptz,
  status_changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exception_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  reason_code text NOT NULL,
  details     jsonb,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  resolution  text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exception_open
  ON public.exception_queue (entity_type, entity_id, reason_code) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                 bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  calculation_id      uuid NOT NULL REFERENCES public.point_calculations (id) ON DELETE RESTRICT,
  production_id       uuid NOT NULL REFERENCES public.production_records (id) ON DELETE RESTRICT,
  producer_id         uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  recipient_id        uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  relationship        text NOT NULL CHECK (relationship IN ('self', 'direct', 'indirect')),
  depth               smallint NOT NULL CHECK (depth >= 0),
  producer_level      text NOT NULL,
  recipient_level     text NOT NULL,
  commission_type     text NOT NULL CHECK (commission_type IN ('personal', 'differential')),
  entry_kind          text NOT NULL CHECK (entry_kind IN ('original', 'reversal')),
  reverses_entry_id   uuid REFERENCES public.commission_ledger (id),
  points              numeric(14, 4) NOT NULL,
  rate_per_point      numeric(10, 2) NOT NULL,
  gross_amount        numeric(14, 2) NOT NULL,
  reserve_amount      numeric(14, 2) NOT NULL,
  net_after_reserve   numeric(14, 2) NOT NULL,
  statement_period_id uuid NOT NULL REFERENCES public.statement_periods (id),
  rule_version_id     uuid NOT NULL REFERENCES public.rule_versions (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_amounts_add_up CHECK (gross_amount = reserve_amount + net_after_reserve),
  CONSTRAINT ledger_reversal_link CHECK ((entry_kind = 'reversal') = (reverses_entry_id IS NOT NULL)),
  CONSTRAINT ledger_unique_entry UNIQUE (calculation_id, recipient_id, commission_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_single_reversal ON public.commission_ledger (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_recipient_period ON public.commission_ledger (recipient_id, statement_period_id);
CREATE INDEX IF NOT EXISTS idx_ledger_production ON public.commission_ledger (production_id);

DROP TRIGGER IF EXISTS commission_ledger_append_only ON public.commission_ledger;
CREATE TRIGGER commission_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

SELECT app_private.attach_audit('public.statement_periods');
SELECT app_private.attach_audit('public.exception_queue');

INSERT INTO public.app_settings (key, value, description)
VALUES ('commission', '{"leader_sees_team_commission": false}'::jsonb,
        'OD-17: dürfen Führungskräfte Provisionsbeträge ihrer Struktur sehen? Standard: nein.')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
-- First open month from the current Berlin month on (created if missing).
CREATE OR REPLACE FUNCTION app_private.booking_period()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date := date_trunc('month', app_private.business_today())::date;
  v_id    uuid;
  v_status text;
BEGIN
  LOOP
    INSERT INTO public.statement_periods (period_month) VALUES (v_month) ON CONFLICT (period_month) DO NOTHING;
    SELECT id, status INTO v_id, v_status FROM public.statement_periods WHERE period_month = v_month;
    IF v_status = 'open' THEN RETURN v_id; END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION app_private.raise_exception_item(p_entity_type text, p_entity_id text, p_reason text, p_details jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.exception_queue (entity_type, entity_id, reason_code, details)
  VALUES (p_entity_type, p_entity_id, p_reason, p_details)
  ON CONFLICT (entity_type, entity_id, reason_code) WHERE status = 'open' DO NOTHING;
$$;

-- ------------------------------------------------------------
-- Booking
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.book_commission(p_calculation_id uuid)
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

  v_version := app_private.rule_version_at('levels', pr.production_date);
  SELECT reserve_ratio INTO v_reserve FROM public.rule_versions WHERE id = v_version;
  v_p_level := app_private.level_at(pr.producer_id, pr.production_date);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.ancestor_id,
           'level', app_private.level_at(a.ancestor_id, pr.production_date),
           'rate', (SELECT l.point_rate FROM public.career_levels l
                     WHERE l.rule_version_id = v_version
                       AND l.code = app_private.level_at(a.ancestor_id, pr.production_date)))
         ORDER BY a.depth), '[]'::jsonb)
    INTO v_chain
    FROM app_private.ancestors_at(pr.producer_id, pr.production_date) a;

  SELECT jsonb_agg(x ->> 'id') INTO v_missing FROM jsonb_array_elements(v_chain) x WHERE x ->> 'level' IS NULL;

  IF v_version IS NULL OR v_p_level IS NULL OR v_missing IS NOT NULL THEN
    -- Don't guess (§16): book nothing for this calculation until fixed.
    PERFORM app_private.raise_exception_item('public.point_calculations', c.id::text,
      CASE WHEN v_version IS NULL THEN 'no_rules_for_date'
           WHEN v_p_level IS NULL THEN 'producer_without_level'
           ELSE 'ancestor_without_level' END,
      jsonb_build_object('production_id', pr.id, 'producer_id', pr.producer_id,
                         'production_date', pr.production_date, 'missing', v_missing));
    RETURN 0;
  END IF;

  SELECT l.point_rate INTO v_p_rate FROM public.career_levels l WHERE l.rule_version_id = v_version AND l.code = v_p_level;
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

CREATE OR REPLACE FUNCTION app_private.book_commission_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.book_commission(NEW.id);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS point_calculations_book_commission ON public.point_calculations;
CREATE TRIGGER point_calculations_book_commission
  AFTER INSERT ON public.point_calculations
  FOR EACH ROW EXECUTE FUNCTION app_private.book_commission_trigger();

-- Finance/admin: book a calculation whose exception has been fixed
-- (e.g. the missing level was set).
CREATE OR REPLACE FUNCTION public.rpc_retry_commission(p_calculation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  IF NOT EXISTS (SELECT 1 FROM public.point_calculations WHERE id = p_calculation_id AND kind = 'original') THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.point_calculations WHERE reverses_id = p_calculation_id) THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.commission_ledger WHERE calculation_id = p_calculation_id) THEN
    RAISE EXCEPTION 'already_booked' USING ERRCODE = 'P0001';
  END IF;
  v_n := app_private.book_commission(p_calculation_id);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'still_not_bookable' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_n;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_dismiss_exception(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  v_reason := app_private.require_reason(p_reason);
  UPDATE public.exception_queue
     SET status = 'dismissed', resolved_at = now(), resolved_by = auth.uid(), resolution = v_reason
   WHERE id = p_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_see_commission_of(p_recipient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_recipient = app_private.current_employee_id()
      OR app_private.has_role('finance')
      OR app_private.has_role('admin')
      OR (coalesce((SELECT (s.value ->> 'leader_sees_team_commission')::boolean
                      FROM public.app_settings s WHERE s.key = 'commission'), false)
          AND p_recipient IN (SELECT app_private.visible_employee_ids()))
$$;
GRANT EXECUTE ON FUNCTION app_private.can_see_commission_of(uuid) TO authenticated;

ALTER TABLE public.statement_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statement_periods_select ON public.statement_periods;
CREATE POLICY statement_periods_select ON public.statement_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS exception_queue_select ON public.exception_queue;
CREATE POLICY exception_queue_select ON public.exception_queue FOR SELECT TO authenticated
  USING (app_private.has_role('finance') OR app_private.has_role('admin'));

DROP POLICY IF EXISTS commission_ledger_select ON public.commission_ledger;
CREATE POLICY commission_ledger_select ON public.commission_ledger FOR SELECT TO authenticated
  USING (app_private.can_see_commission_of(recipient_id));

REVOKE ALL ON public.statement_periods, public.exception_queue, public.commission_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.statement_periods, public.exception_queue, public.commission_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statement_periods, public.exception_queue, public.commission_ledger TO service_role;

-- Ledger with names and production facts. Deliberately NOT security_invoker:
-- a recipient must keep seeing their own commission even when the producer
-- has since left their structure (production/employee RLS would hide those
-- rows). Visibility is enforced explicitly with the same rule as the table
-- policy, so the view never shows more than the ledger itself.
CREATE OR REPLACE VIEW public.v_commission_ledger AS
SELECT l.*,
       sp.period_month,
       sp.status AS period_status,
       pr.production_date,
       pr.category_code,
       pe.first_name || ' ' || pe.last_name AS producer_name,
       re.first_name || ' ' || re.last_name AS recipient_name
  FROM public.commission_ledger l
  JOIN public.statement_periods sp ON sp.id = l.statement_period_id
  JOIN public.production_records pr ON pr.id = l.production_id
  JOIN public.employees pe ON pe.id = l.producer_id
  JOIN public.employees re ON re.id = l.recipient_id
 WHERE app_private.can_see_commission_of(l.recipient_id);

REVOKE ALL ON public.v_commission_ledger FROM PUBLIC, anon;
GRANT SELECT ON public.v_commission_ledger TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_retry_commission(uuid), public.rpc_dismiss_exception(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_retry_commission(uuid), public.rpc_dismiss_exception(uuid, text) TO authenticated;
