-- ============================================================
-- r1/p4/leads: lead intake, pipeline, assignment, SLA, duplicates (§9)
-- ============================================================
-- lead_stages         configurable pipeline (§9.2): order, kind
--                     (open/won/lost/nurture), mandatory fields per stage,
--                     whether the stage may be entered by skipping others.
-- lead_sources        where leads come from; lead_source_costs per month
--                     (cost per lead/sale only when a cost exists, §9.4).
-- leads               identity, source, ownership, qualification, pipeline,
--                     conversion (§9.1). PII is redacted in the audit log.
-- lead_stage_history  append-only stage entries (stage entry dates).
-- lead_assignments    append-only ownership history with reason (§9.3).
-- business_calendar   holidays for SLA business hours (region 'DE' =
--                     nationwide; Bundesland rows like 'DE-BY').
-- app_settings.lead_sla  SLA hours, working day, workdays, region,
--                     escalation. Provisional default 8 business hours,
--                     Mon–Fri 09:00–17:00 (OD-19) until Profina decides.
--
-- Visibility: owner, the owner's managers, admins; unassigned leads (the
-- pool) are visible to leaders and admins. Writes only through RPCs.
-- Duplicates are never merged silently (§9.5): creating a lead that matches
-- an existing one by phone, email or similar name needs an explicit
-- confirmation, and merging is a separate, audited action.
-- Activities on a lead move it forward automatically (contact attempt,
-- reached, appointment booked/held), never backwards and never past
-- 'appointment_held'.
-- Task generators lead_first_contact, lead_next_action and lead_unassigned
-- run inside app_private.run_task_generators().
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- Configuration
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_stages (
  code            text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]*$'),
  name_de         text NOT NULL,
  position        integer NOT NULL UNIQUE,
  kind            text NOT NULL CHECK (kind IN ('open', 'won', 'lost', 'nurture')),
  required_fields text[] NOT NULL DEFAULT '{}' CHECK (required_fields <@ ARRAY[
                    'owner', 'phone_or_email', 'product_interest', 'next_action_at', 'loss_reason',
                    'consent', 'production', 'appointment', 'appointment_held']),
  allow_skip      boolean NOT NULL DEFAULT true,
  active          boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lead_stages (code, name_de, position, kind, required_fields, allow_skip) VALUES
  ('new',                'Neu',                  10, 'open',    '{}',                  false),
  ('assigned',           'Zugewiesen',           20, 'open',    '{owner}',             true),
  ('contact_attempted',  'Kontaktversuch',       30, 'open',    '{owner}',             true),
  ('contacted',          'Erreicht',             40, 'open',    '{owner}',             true),
  ('qualified',          'Qualifiziert',         50, 'open',    '{owner,product_interest}', true),
  ('appointment_booked', 'Termin vereinbart',    60, 'open',    '{owner,appointment}', true),
  ('appointment_held',   'Termin durchgeführt',  70, 'open',    '{owner,appointment_held}', true),
  ('offer',              'Angebot',              80, 'open',    '{owner,product_interest}', true),
  ('won',                'Gewonnen',             90, 'won',     '{owner}',             true),
  ('lost',               'Verloren',             91, 'lost',    '{loss_reason}',       true),
  ('nurture',            'Später nachfassen',    95, 'nurture', '{next_action_at}',    true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  kind       text NOT NULL DEFAULT 'campaign' CHECK (kind IN ('own', 'referral', 'campaign', 'website', 'import', 'other')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lead_sources (name, kind) VALUES
  ('Eigener Kontakt', 'own'), ('Empfehlung', 'referral'), ('Profina-Kampagne', 'campaign'),
  ('Website', 'website'), ('Import', 'import')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lead_source_costs (
  source_id  uuid NOT NULL REFERENCES public.lead_sources (id) ON DELETE CASCADE,
  month      date NOT NULL CHECK (month = date_trunc('month', month)::date),
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  note       text CHECK (note IS NULL OR length(note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, month)
);

CREATE TABLE IF NOT EXISTS public.business_calendar (
  day    date NOT NULL,
  region text NOT NULL DEFAULT 'DE' CHECK (region ~ '^DE(-[A-Z]{2})?$'),
  name   text NOT NULL,
  PRIMARY KEY (day, region)
);

-- Nationwide public holidays 2026–2027 (Bundesland holidays: add rows per region).
INSERT INTO public.business_calendar (day, name) VALUES
  ('2026-01-01', 'Neujahr'), ('2026-04-03', 'Karfreitag'), ('2026-04-06', 'Ostermontag'),
  ('2026-05-01', 'Tag der Arbeit'), ('2026-05-14', 'Christi Himmelfahrt'), ('2026-05-25', 'Pfingstmontag'),
  ('2026-10-03', 'Tag der Deutschen Einheit'), ('2026-12-25', '1. Weihnachtstag'), ('2026-12-26', '2. Weihnachtstag'),
  ('2027-01-01', 'Neujahr'), ('2027-03-26', 'Karfreitag'), ('2027-03-29', 'Ostermontag'),
  ('2027-05-01', 'Tag der Arbeit'), ('2027-05-06', 'Christi Himmelfahrt'), ('2027-05-17', 'Pfingstmontag'),
  ('2027-10-03', 'Tag der Deutschen Einheit'), ('2027-12-25', '1. Weihnachtstag'), ('2027-12-26', '2. Weihnachtstag')
ON CONFLICT DO NOTHING;

INSERT INTO public.app_settings (key, value, description)
VALUES ('lead_sla', jsonb_build_object(
          'first_contact_hours', 8, 'workday_start', '09:00', 'workday_end', '17:00',
          'workdays', jsonb_build_array(1, 2, 3, 4, 5), 'holiday_region', 'DE',
          'escalate_to_manager', true, 'provisional', true),
        'Lead-SLA in Geschäftsstunden (OD-19, vorläufig bis zur Entscheidung durch Profina)')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Leads
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_no            bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  -- identity
  first_name         text CHECK (first_name IS NULL OR length(first_name) <= 100),
  last_name          text CHECK (last_name IS NULL OR length(last_name) <= 100),
  company            text CHECK (company IS NULL OR length(company) <= 200),
  phone              text,
  email              text,
  preferred_channel  text NOT NULL DEFAULT 'any' CHECK (preferred_channel IN ('any', 'phone', 'email', 'whatsapp', 'in_person')),
  search_name        text GENERATED ALWAYS AS (
                       lower(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(company, '')))) STORED,
  -- source
  source_id          uuid NOT NULL REFERENCES public.lead_sources (id) ON DELETE RESTRICT,
  campaign           text CHECK (campaign IS NULL OR length(campaign) <= 200),
  referral           text CHECK (referral IS NULL OR length(referral) <= 200),
  received_at        timestamptz NOT NULL DEFAULT now(),
  -- ownership
  owner_id           uuid REFERENCES public.employees (id) ON DELETE RESTRICT,
  assigned_by        uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  assigned_at        timestamptz,
  created_by         uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  -- qualification
  product_interest   text[] NOT NULL DEFAULT '{}',
  region             text CHECK (region IS NULL OR length(region) <= 100),
  priority           text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  consent_basis      text CHECK (consent_basis IN ('consent', 'contract', 'legitimate_interest')),
  consent_recorded_at timestamptz,
  notes              text CHECK (notes IS NULL OR length(notes) <= 4000),
  -- pipeline
  stage              text NOT NULL DEFAULT 'new' REFERENCES public.lead_stages (code),
  stage_entered_at   timestamptz NOT NULL DEFAULT now(),
  next_action        text CHECK (next_action IS NULL OR length(next_action) <= 300),
  next_action_at     timestamptz,
  first_contact_at   timestamptz,
  sla_due_at         timestamptz,
  loss_reason        text CHECK (loss_reason IN ('no_interest', 'not_reachable', 'price', 'competitor', 'no_need', 'not_eligible', 'other')),
  closed_at          timestamptz,
  -- conversion
  production_id      uuid REFERENCES public.production_records (id) ON DELETE SET NULL,
  customer_id        uuid,
  merged_into        uuid REFERENCES public.leads (id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT leads_email_format CHECK (email IS NULL OR (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  CONSTRAINT leads_not_self_merged CHECK (merged_into IS NULL OR merged_into <> id)
);

CREATE INDEX IF NOT EXISTS idx_leads_owner_stage ON public.leads (owner_id, stage) WHERE merged_into IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm ON public.leads USING gin (search_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_received ON public.leads (received_at);

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id    uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  from_stage text REFERENCES public.lead_stages (code),
  to_stage   text NOT NULL REFERENCES public.lead_stages (code),
  changed_by uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  automatic  boolean NOT NULL DEFAULT false,
  note       text CHECK (note IS NULL OR length(note) <= 1000),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON public.lead_stage_history (lead_id, changed_at);

CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id     uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  from_owner  uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  to_owner    uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  reason      text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead ON public.lead_assignments (lead_id, assigned_at);

-- Append-only histories.
CREATE OR REPLACE FUNCTION app_private.forbid_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'append_only' USING ERRCODE = '42501';
END
$$;

DROP TRIGGER IF EXISTS lead_stage_history_append_only ON public.lead_stage_history;
CREATE TRIGGER lead_stage_history_append_only BEFORE UPDATE OR DELETE ON public.lead_stage_history
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();
DROP TRIGGER IF EXISTS lead_assignments_append_only ON public.lead_assignments;
CREATE TRIGGER lead_assignments_append_only BEFORE UPDATE OR DELETE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

DROP TRIGGER IF EXISTS leads_touch ON public.leads;
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
DROP TRIGGER IF EXISTS lead_stages_touch ON public.lead_stages;
CREATE TRIGGER lead_stages_touch BEFORE UPDATE ON public.lead_stages FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
DROP TRIGGER IF EXISTS lead_sources_touch ON public.lead_sources;
CREATE TRIGGER lead_sources_touch BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

SELECT app_private.attach_audit('public.leads', 'id', '{updated_at,search_name}', '{first_name,last_name,company,phone,email,notes}');
SELECT app_private.attach_audit('public.lead_stages', 'code', '{updated_at}');
SELECT app_private.attach_audit('public.lead_sources', 'id', '{updated_at}');
SELECT app_private.attach_audit('public.lead_source_costs', 'source_id', '{updated_at}');
SELECT app_private.attach_audit('public.business_calendar', 'day');

-- Validation with readable keys (CHECK constraints stay as the last line of defence).
CREATE OR REPLACE FUNCTION app_private.validate_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.first_name := nullif(btrim(NEW.first_name), '');
  NEW.last_name  := nullif(btrim(NEW.last_name), '');
  NEW.company    := nullif(btrim(NEW.company), '');
  NEW.phone      := nullif(btrim(NEW.phone), '');
  NEW.email      := nullif(lower(btrim(NEW.email)), '');
  NEW.notes      := nullif(btrim(NEW.notes), '');
  IF NEW.last_name IS NULL AND NEW.company IS NULL THEN
    RAISE EXCEPTION 'lead_name_required' USING ERRCODE = '22023';
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.product_interest) p
              WHERE NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.code = p)) THEN
    RAISE EXCEPTION 'unknown_category' USING ERRCODE = '22023';
  END IF;
  IF NEW.received_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.lead_sources s WHERE s.id = NEW.source_id AND s.active) THEN
      RAISE EXCEPTION 'unknown_source' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.consent_basis IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.consent_basis END) THEN
    NEW.consent_recorded_at := CASE WHEN NEW.consent_basis IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS leads_validate ON public.leads;
CREATE TRIGGER leads_validate BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION app_private.validate_lead();

-- ------------------------------------------------------------
-- Permissions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.is_leader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.current_employee_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM app_private.descendants_at(app_private.current_employee_id(), app_private.business_today()))
$$;

-- Read: owner, the owner's managers, admins; the unassigned pool for leaders and admins.
CREATE OR REPLACE FUNCTION app_private.can_see_lead(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN app_private.has_role('admin') OR app_private.is_leader()
    ELSE p_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_owner) OR app_private.has_role('admin')
  END
$$;

-- Write: like read, but an admin who is neither owner nor manager needs MFA.
CREATE OR REPLACE FUNCTION app_private.assert_can_write_lead(p_owner uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NOT NULL AND (p_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_owner)) THEN
    RETURN;
  END IF;
  IF p_owner IS NULL AND app_private.is_leader() THEN
    RETURN;
  END IF;
  IF app_private.has_role('admin') THEN
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END
$$;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_source_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
  USING (merged_into IS NULL AND app_private.can_see_lead(owner_id));
DROP POLICY IF EXISTS lead_stage_history_select ON public.lead_stage_history;
CREATE POLICY lead_stage_history_select ON public.lead_stage_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));
DROP POLICY IF EXISTS lead_assignments_select ON public.lead_assignments;
CREATE POLICY lead_assignments_select ON public.lead_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));
-- Configuration is readable by every employee; source costs only by admins (and finance).
DROP POLICY IF EXISTS lead_stages_select ON public.lead_stages;
CREATE POLICY lead_stages_select ON public.lead_stages FOR SELECT TO authenticated
  USING (app_private.current_employee_id() IS NOT NULL);
DROP POLICY IF EXISTS lead_sources_select ON public.lead_sources;
CREATE POLICY lead_sources_select ON public.lead_sources FOR SELECT TO authenticated
  USING (app_private.current_employee_id() IS NOT NULL);
DROP POLICY IF EXISTS business_calendar_select ON public.business_calendar;
CREATE POLICY business_calendar_select ON public.business_calendar FOR SELECT TO authenticated
  USING (app_private.current_employee_id() IS NOT NULL);
DROP POLICY IF EXISTS lead_source_costs_select ON public.lead_source_costs;
CREATE POLICY lead_source_costs_select ON public.lead_source_costs FOR SELECT TO authenticated
  USING (app_private.has_role('admin') OR app_private.has_role('finance'));

REVOKE ALL ON public.leads, public.lead_stage_history, public.lead_assignments, public.lead_stages,
  public.lead_sources, public.lead_source_costs, public.business_calendar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.leads, public.lead_stage_history, public.lead_assignments, public.lead_stages,
  public.lead_sources, public.lead_source_costs, public.business_calendar TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads, public.lead_stages, public.lead_sources,
  public.lead_source_costs, public.business_calendar TO service_role;
GRANT SELECT, INSERT ON public.lead_stage_history, public.lead_assignments TO service_role;

-- ------------------------------------------------------------
-- SLA in business hours
-- ------------------------------------------------------------
-- Adds business hours to an instant: only on configured workdays, between
-- workday_start and workday_end (Berlin wall time), skipping holidays of the
-- nationwide calendar and the configured region. Mirrored by src/domain/sla.ts.
CREATE OR REPLACE FUNCTION app_private.add_business_hours(p_start timestamptz, p_hours numeric)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s          jsonb := (SELECT value FROM public.app_settings WHERE key = 'lead_sla');
  v_ws       time := (s ->> 'workday_start')::time;
  v_we       time := (s ->> 'workday_end')::time;
  v_days     integer[] := ARRAY(SELECT jsonb_array_elements_text(s -> 'workdays')::integer);
  v_region   text := coalesce(s ->> 'holiday_region', 'DE');
  v_left     interval := p_hours * interval '1 hour';
  v_local    timestamp := p_start AT TIME ZONE 'Europe/Berlin';
  v_day      date;
  v_open     timestamp;
  v_close    timestamp;
BEGIN
  IF p_hours IS NULL OR p_hours < 0 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  FOR i IN 1..800 LOOP
    v_day := v_local::date;
    IF extract(isodow FROM v_day)::integer = ANY (v_days)
       AND NOT EXISTS (SELECT 1 FROM public.business_calendar c WHERE c.day = v_day AND c.region IN ('DE', v_region)) THEN
      v_open := v_day + v_ws;
      v_close := v_day + v_we;
      IF v_local < v_open THEN v_local := v_open; END IF;
      IF v_local < v_close THEN
        IF v_left <= v_close - v_local THEN
          RETURN (v_local + v_left) AT TIME ZONE 'Europe/Berlin';
        END IF;
        v_left := v_left - (v_close - v_local);
      END IF;
    END IF;
    v_local := (v_day + 1) + v_ws;
  END LOOP;
  RAISE EXCEPTION 'calendar_exhausted' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION app_private.lead_sla_due(p_received timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.add_business_hours(p_received,
           (SELECT (value ->> 'first_contact_hours')::numeric FROM public.app_settings WHERE key = 'lead_sla'))
$$;

-- ------------------------------------------------------------
-- Duplicates
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.lead_duplicates(
  p_first text, p_last text, p_company text, p_phone text, p_email text, p_exclude uuid DEFAULT NULL
)
RETURNS TABLE (lead_id uuid, owner_id uuid, reason text, score real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH q AS (
    SELECT lower(btrim(coalesce(btrim(p_first), '') || ' ' || coalesce(btrim(p_last), '') || ' ' || coalesce(btrim(p_company), ''))) AS name,
           nullif(btrim(p_phone), '') AS phone, nullif(lower(btrim(p_email)), '') AS email
  )
  SELECT l.id, l.owner_id,
         CASE WHEN q.phone IS NOT NULL AND l.phone = q.phone THEN 'phone'
              WHEN q.email IS NOT NULL AND l.email = q.email THEN 'email'
              ELSE 'name' END,
         CASE WHEN (q.phone IS NOT NULL AND l.phone = q.phone) OR (q.email IS NOT NULL AND l.email = q.email) THEN 1::real
              ELSE extensions.similarity(l.search_name, q.name) END
    FROM public.leads l, q
   WHERE l.merged_into IS NULL
     AND (p_exclude IS NULL OR l.id <> p_exclude)
     AND ((q.phone IS NOT NULL AND l.phone = q.phone)
       OR (q.email IS NOT NULL AND l.email = q.email)
       OR (length(q.name) >= 5 AND extensions.similarity(l.search_name, q.name) >= 0.5))
   ORDER BY 4 DESC, l.received_at DESC
   LIMIT 10
$$;

-- Matches for the create form. Leads the caller can't see are reported
-- without their details, so nobody learns other people's contacts.
CREATE OR REPLACE FUNCTION public.rpc_find_lead_duplicates(
  p_first_name text, p_last_name text, p_company text, p_phone text, p_email text, p_exclude uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', CASE WHEN v.visible THEN d.lead_id END,
             'lead_no', CASE WHEN v.visible THEN l.lead_no END,
             'name', CASE WHEN v.visible THEN btrim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '') || ' ' || coalesce(l.company, '')) END,
             'stage', CASE WHEN v.visible THEN l.stage END,
             'owner', CASE WHEN e.id IS NULL THEN NULL ELSE e.first_name || ' ' || e.last_name END,
             'reason', d.reason, 'visible', v.visible) ORDER BY d.score DESC)
      FROM app_private.lead_duplicates(p_first_name, p_last_name, p_company, p_phone, p_email, p_exclude) d
      JOIN public.leads l ON l.id = d.lead_id
      LEFT JOIN public.employees e ON e.id = d.owner_id
      CROSS JOIN LATERAL (SELECT app_private.can_see_lead(d.owner_id) AS visible) v), '[]'::jsonb);
END
$$;

-- ------------------------------------------------------------
-- Stage machinery
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.lead_missing_fields(p_lead public.leads, p_required text[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(f ORDER BY f), '{}')
    FROM unnest(p_required) f
   WHERE NOT CASE f
     WHEN 'owner' THEN p_lead.owner_id IS NOT NULL
     WHEN 'phone_or_email' THEN p_lead.phone IS NOT NULL OR p_lead.email IS NOT NULL
     WHEN 'product_interest' THEN cardinality(p_lead.product_interest) > 0
     WHEN 'next_action_at' THEN p_lead.next_action_at IS NOT NULL
     WHEN 'loss_reason' THEN p_lead.loss_reason IS NOT NULL
     WHEN 'consent' THEN p_lead.consent_basis IS NOT NULL
     WHEN 'production' THEN p_lead.production_id IS NOT NULL
     WHEN 'appointment' THEN EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = p_lead.id
                                        AND a.type = 'appointment' AND (a.outcome IS NULL OR a.outcome = 'held'))
     WHEN 'appointment_held' THEN EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = p_lead.id
                                             AND a.type = 'appointment' AND a.outcome = 'held')
     ELSE true END
$$;

-- Moves a lead to a stage and writes history. Callers check permissions.
CREATE OR REPLACE FUNCTION app_private.move_lead(p_lead_id uuid, p_stage text, p_automatic boolean, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from text;
  v_kind text := (SELECT kind FROM public.lead_stages WHERE code = p_stage);
BEGIN
  SELECT stage INTO v_from FROM public.leads WHERE id = p_lead_id;
  UPDATE public.leads
     SET stage = p_stage, stage_entered_at = now(),
         closed_at = CASE WHEN v_kind IN ('won', 'lost') THEN now() END,
         loss_reason = CASE WHEN v_kind = 'lost' THEN loss_reason END
   WHERE id = p_lead_id;
  INSERT INTO public.lead_stage_history (lead_id, from_stage, to_stage, changed_by, automatic, note)
  VALUES (p_lead_id, v_from, p_stage, app_private.current_employee_id(), p_automatic, nullif(btrim(coalesce(p_note, '')), ''));
END
$$;

-- Activities push open leads forward (never backwards, never out of won/lost/nurture).
CREATE OR REPLACE FUNCTION app_private.lead_activity_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l        public.leads%ROWTYPE;
  v_target text;
  v_cur    integer;
BEGIN
  IF NEW.linked_type IS DISTINCT FROM 'lead' THEN RETURN NEW; END IF;
  SELECT * INTO l FROM public.leads WHERE id = NEW.linked_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.type IN ('contact_attempt', 'call', 'email') AND l.first_contact_at IS NULL THEN
    UPDATE public.leads SET first_contact_at = NEW.occurred_at WHERE id = l.id;
  END IF;

  v_target := CASE
    WHEN NEW.type = 'appointment' AND NEW.outcome = 'held' THEN 'appointment_held'
    WHEN NEW.type = 'appointment' AND NEW.outcome IS NULL THEN 'appointment_booked'
    WHEN NEW.type IN ('contact_attempt', 'call', 'email') AND NEW.outcome = 'reached' THEN 'contacted'
    WHEN NEW.type IN ('contact_attempt', 'call', 'email') THEN 'contact_attempted'
  END;
  IF v_target IS NULL OR l.owner_id IS NULL THEN RETURN NEW; END IF;

  SELECT position INTO v_cur FROM public.lead_stages WHERE code = l.stage AND kind = 'open';
  IF v_cur IS NOT NULL AND v_cur < (SELECT position FROM public.lead_stages WHERE code = v_target AND active) THEN
    PERFORM app_private.move_lead(l.id, v_target, true, 'Automatisch aus Aktivität');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS activities_lead_effects ON public.activities;
CREATE TRIGGER activities_lead_effects AFTER INSERT OR UPDATE OF outcome ON public.activities
  FOR EACH ROW EXECUTE FUNCTION app_private.lead_activity_effects();

-- Activities on a lead: the lead must exist, be active and be workable by the caller.
CREATE OR REPLACE FUNCTION app_private.check_activity_link(p_linked_type text, p_linked_id uuid, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l public.leads%ROWTYPE;
BEGIN
  IF p_linked_type IS NULL OR p_linked_id IS NULL THEN RETURN; END IF; -- the link-pair constraint rejects half links
  IF p_linked_type = 'customer' THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF; -- Phase 5
  SELECT * INTO l FROM public.leads WHERE id = p_linked_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id);
END
$$;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.lead_display_name(p_lead public.leads)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(nullif(btrim(coalesce(p_lead.first_name, '') || ' ' || coalesce(p_lead.last_name, '')), ''), p_lead.company, 'Lead')
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_lead(
  p_data jsonb, p_owner_id uuid DEFAULT NULL, p_to_pool boolean DEFAULT false, p_confirm_duplicates boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_owner uuid := CASE WHEN p_to_pool THEN NULL ELSE coalesce(p_owner_id, app_private.current_employee_id()) END;
  l       public.leads%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_owner IS NULL OR v_owner <> v_me THEN
    PERFORM app_private.assert_can_write_lead(v_owner);
  END IF;
  IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_owner AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_confirm_duplicates AND EXISTS (
    SELECT 1 FROM app_private.lead_duplicates(p_data ->> 'first_name', p_data ->> 'last_name', p_data ->> 'company',
                                              p_data ->> 'phone', p_data ->> 'email')) THEN
    RAISE EXCEPTION 'possible_duplicate' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.set_audit_context('Lead angelegt');
  INSERT INTO public.leads (
    first_name, last_name, company, phone, email, preferred_channel, source_id, campaign, referral, received_at,
    owner_id, assigned_by, assigned_at, created_by, product_interest, region, priority, consent_basis, notes,
    stage, next_action, next_action_at)
  VALUES (
    p_data ->> 'first_name', p_data ->> 'last_name', p_data ->> 'company', p_data ->> 'phone', p_data ->> 'email',
    coalesce(p_data ->> 'preferred_channel', 'any'), (p_data ->> 'source_id')::uuid, p_data ->> 'campaign', p_data ->> 'referral',
    coalesce((p_data ->> 'received_at')::timestamptz, now()),
    v_owner, CASE WHEN v_owner IS NOT NULL THEN v_me END, CASE WHEN v_owner IS NOT NULL THEN now() END, v_me,
    coalesce(ARRAY(SELECT jsonb_array_elements_text(p_data -> 'product_interest')), '{}'),
    p_data ->> 'region', coalesce(p_data ->> 'priority', 'normal'), p_data ->> 'consent_basis', p_data ->> 'notes',
    CASE WHEN v_owner IS NULL THEN 'new' ELSE 'assigned' END,
    p_data ->> 'next_action', (p_data ->> 'next_action_at')::timestamptz)
  RETURNING * INTO l;

  UPDATE public.leads SET sla_due_at = app_private.lead_sla_due(l.received_at) WHERE id = l.id;
  INSERT INTO public.lead_stage_history (lead_id, from_stage, to_stage, changed_by, note)
  VALUES (l.id, NULL, l.stage, v_me, 'Angelegt');
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.lead_assignments (lead_id, from_owner, to_owner, assigned_by, reason)
    VALUES (l.id, NULL, v_owner, v_me, 'Angelegt');
    IF v_owner <> v_me THEN
      PERFORM app_private.notify(v_owner, 'lead_assigned', 'Neuer Lead: ' || app_private.lead_display_name(l), NULL, '/vertrieb/leads/' || l.id);
    END IF;
  END IF;
  RETURN l.id;
END
$$;

-- Edits identity, contact, qualification and next action. Keys that are
-- present in p_data are written (null clears); stage and owner have their own RPCs.
CREATE OR REPLACE FUNCTION public.rpc_update_lead(p_lead_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id);
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN (
      'first_name', 'last_name', 'company', 'phone', 'email', 'preferred_channel', 'source_id', 'campaign', 'referral',
      'product_interest', 'region', 'priority', 'consent_basis', 'notes', 'next_action', 'next_action_at')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.set_audit_context('Lead bearbeitet');
  UPDATE public.leads SET
    first_name = CASE WHEN p_data ? 'first_name' THEN p_data ->> 'first_name' ELSE first_name END,
    last_name = CASE WHEN p_data ? 'last_name' THEN p_data ->> 'last_name' ELSE last_name END,
    company = CASE WHEN p_data ? 'company' THEN p_data ->> 'company' ELSE company END,
    phone = CASE WHEN p_data ? 'phone' THEN p_data ->> 'phone' ELSE phone END,
    email = CASE WHEN p_data ? 'email' THEN p_data ->> 'email' ELSE email END,
    preferred_channel = CASE WHEN p_data ? 'preferred_channel' THEN coalesce(p_data ->> 'preferred_channel', 'any') ELSE preferred_channel END,
    source_id = CASE WHEN p_data ? 'source_id' THEN (p_data ->> 'source_id')::uuid ELSE source_id END,
    campaign = CASE WHEN p_data ? 'campaign' THEN p_data ->> 'campaign' ELSE campaign END,
    referral = CASE WHEN p_data ? 'referral' THEN p_data ->> 'referral' ELSE referral END,
    product_interest = CASE WHEN p_data ? 'product_interest'
                         THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(p_data -> 'product_interest')), '{}') ELSE product_interest END,
    region = CASE WHEN p_data ? 'region' THEN p_data ->> 'region' ELSE region END,
    priority = CASE WHEN p_data ? 'priority' THEN coalesce(p_data ->> 'priority', 'normal') ELSE priority END,
    consent_basis = CASE WHEN p_data ? 'consent_basis' THEN p_data ->> 'consent_basis' ELSE consent_basis END,
    notes = CASE WHEN p_data ? 'notes' THEN p_data ->> 'notes' ELSE notes END,
    next_action = CASE WHEN p_data ? 'next_action' THEN p_data ->> 'next_action' ELSE next_action END,
    next_action_at = CASE WHEN p_data ? 'next_action_at' THEN (p_data ->> 'next_action_at')::timestamptz ELSE next_action_at END
  WHERE id = p_lead_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_lead_stage(
  p_lead_id uuid, p_stage text, p_note text DEFAULT NULL, p_loss_reason text DEFAULT NULL,
  p_next_action text DEFAULT NULL, p_next_action_at timestamptz DEFAULT NULL, p_production_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l       public.leads%ROWTYPE;
  v_cur   public.lead_stages%ROWTYPE;
  v_new   public.lead_stages%ROWTYPE;
  v_miss  text[];
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id);
  SELECT * INTO v_new FROM public.lead_stages WHERE code = p_stage AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_stage' USING ERRCODE = '22023'; END IF;
  IF p_stage = l.stage THEN RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_cur FROM public.lead_stages WHERE code = l.stage;

  -- Going back, or reopening a closed lead, needs a reason.
  IF v_cur.kind <> 'open' AND v_new.kind = 'open' OR (v_cur.kind = 'open' AND v_new.kind = 'open' AND v_new.position < v_cur.position) THEN
    PERFORM app_private.require_reason(p_note);
  ELSE
    PERFORM app_private.set_audit_context(coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Phase geändert'));
  END IF;
  -- Skipping open stages is allowed only if the target allows it.
  IF v_new.kind = 'open' AND v_cur.kind = 'open' AND NOT v_new.allow_skip AND EXISTS (
    SELECT 1 FROM public.lead_stages s WHERE s.kind = 'open' AND s.active AND s.position > v_cur.position AND s.position < v_new.position) THEN
    RAISE EXCEPTION 'stage_skip_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF p_production_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_records pr WHERE pr.id = p_production_id AND pr.producer_id = l.owner_id) THEN
    RAISE EXCEPTION 'production_not_owner' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.move_lead(l.id, p_stage, false, p_note);
  UPDATE public.leads
     SET loss_reason = CASE WHEN v_new.kind = 'lost' THEN p_loss_reason END,
         next_action = coalesce(nullif(btrim(coalesce(p_next_action, '')), ''), next_action),
         next_action_at = coalesce(p_next_action_at, next_action_at),
         production_id = coalesce(p_production_id, production_id)
   WHERE id = l.id
   RETURNING * INTO l;

  v_miss := app_private.lead_missing_fields(l, v_new.required_fields);
  IF cardinality(v_miss) > 0 THEN
    RAISE EXCEPTION 'stage_requirements_missing' USING ERRCODE = 'P0001', DETAIL = array_to_string(v_miss, ',');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_assign_lead(p_lead_id uuid, p_owner_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  l       public.leads%ROWTYPE;
  v_kind  text;
  v_moved integer := 0;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id);
  IF p_owner_id IS NOT DISTINCT FROM l.owner_id THEN RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001'; END IF;
  SELECT kind INTO v_kind FROM public.lead_stages WHERE code = l.stage;
  IF v_kind IN ('won', 'lost') THEN RAISE EXCEPTION 'lead_closed' USING ERRCODE = 'P0001'; END IF;

  -- Target: yourself, someone in your structure, or the pool (leaders); admins anyone (with MFA).
  IF p_owner_id IS NULL THEN
    IF NOT (app_private.is_leader() OR app_private.has_role('admin')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  ELSIF NOT (p_owner_id = v_me OR app_private.is_manager_of(p_owner_id)) THEN
    IF NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;

  -- First assignment from the pool needs no reason; every reassignment does (§9.3).
  IF l.owner_id IS NULL THEN
    PERFORM app_private.set_audit_context(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Lead zugewiesen'));
  ELSE
    PERFORM app_private.require_reason(p_reason);
  END IF;

  UPDATE public.leads
     SET owner_id = p_owner_id,
         assigned_by = CASE WHEN p_owner_id IS NULL THEN NULL ELSE v_me END,
         assigned_at = CASE WHEN p_owner_id IS NULL THEN NULL ELSE now() END
   WHERE id = l.id;
  INSERT INTO public.lead_assignments (lead_id, from_owner, to_owner, assigned_by, reason)
  VALUES (l.id, l.owner_id, p_owner_id, v_me, nullif(btrim(coalesce(p_reason, '')), ''));

  IF p_owner_id IS NOT NULL AND l.stage = 'new' THEN
    PERFORM app_private.move_lead(l.id, 'assigned', true, 'Zugewiesen');
  ELSIF p_owner_id IS NULL AND l.stage = 'assigned' THEN
    PERFORM app_private.move_lead(l.id, 'new', true, 'Zurück in den Pool');
  END IF;

  -- Upcoming appointments go with the lead, so the new owner sees them.
  IF p_owner_id IS NOT NULL THEN
    UPDATE public.activities
       SET owner_id = p_owner_id,
           notes = left(coalesce(notes || E'\n', '') || 'Übernommen bei Neuzuweisung des Leads', 4000)
     WHERE linked_type = 'lead' AND linked_id = l.id AND type = 'appointment'
       AND outcome IS NULL AND scheduled_at > now() AND owner_id <> p_owner_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF p_owner_id <> v_me THEN
      PERFORM app_private.notify(p_owner_id, 'lead_assigned', 'Lead zugewiesen: ' || app_private.lead_display_name(l),
                                 nullif(btrim(coalesce(p_reason, '')), ''), '/vertrieb/leads/' || l.id);
    END IF;
  END IF;
  RETURN jsonb_build_object('appointments_moved', v_moved);
END
$$;

-- Merges a duplicate into the lead that is kept (§9.5). Empty fields of the
-- kept lead are filled from the duplicate; activities move over; the
-- duplicate stays as an archived record pointing to the kept one.
CREATE OR REPLACE FUNCTION public.rpc_merge_leads(p_keep_id uuid, p_merge_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k public.leads%ROWTYPE;
  m public.leads%ROWTYPE;
BEGIN
  IF p_keep_id = p_merge_id THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  -- Lock both in a fixed order.
  PERFORM 1 FROM public.leads WHERE id IN (p_keep_id, p_merge_id) ORDER BY id FOR UPDATE;
  SELECT * INTO k FROM public.leads WHERE id = p_keep_id;
  SELECT * INTO m FROM public.leads WHERE id = p_merge_id;
  IF k.id IS NULL OR m.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF k.merged_into IS NOT NULL OR m.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(k.owner_id);
  PERFORM app_private.assert_can_write_lead(m.owner_id);
  PERFORM app_private.require_reason(p_reason);

  UPDATE public.leads SET
    first_name = coalesce(k.first_name, m.first_name),
    last_name = coalesce(k.last_name, m.last_name),
    company = coalesce(k.company, m.company),
    phone = coalesce(k.phone, m.phone),
    email = coalesce(k.email, m.email),
    region = coalesce(k.region, m.region),
    consent_basis = coalesce(k.consent_basis, m.consent_basis),
    product_interest = ARRAY(SELECT DISTINCT unnest(k.product_interest || m.product_interest) ORDER BY 1),
    received_at = least(k.received_at, m.received_at),
    first_contact_at = CASE WHEN k.first_contact_at IS NULL OR m.first_contact_at IS NULL
                            THEN coalesce(k.first_contact_at, m.first_contact_at)
                            ELSE least(k.first_contact_at, m.first_contact_at) END,
    notes = left(nullif(concat_ws(E'\n', k.notes, m.notes), ''), 4000)
  WHERE id = k.id;
  UPDATE public.activities SET linked_id = k.id WHERE linked_type = 'lead' AND linked_id = m.id;
  UPDATE public.leads SET merged_into = k.id, closed_at = coalesce(closed_at, now()) WHERE id = m.id;
  INSERT INTO public.lead_stage_history (lead_id, from_stage, to_stage, changed_by, note)
  VALUES (m.id, m.stage, m.stage, app_private.current_employee_id(), 'Zusammengeführt mit L-' || k.lead_no || ': ' || btrim(p_reason));
END
$$;

-- Configuration for forms: stages, active sources, loss reasons, SLA.
CREATE OR REPLACE FUNCTION public.rpc_lead_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'stages', (SELECT jsonb_agg(to_jsonb(s) - 'updated_at' ORDER BY s.position) FROM public.lead_stages s),
    'sources', (SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'active', s.active) ORDER BY s.name)
                  FROM public.lead_sources s),
    'sla', (SELECT value FROM public.app_settings WHERE key = 'lead_sla'),
    'holidays', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', c.day, 'region', c.region, 'name', c.name) ORDER BY c.day), '[]')
                   FROM public.business_calendar c WHERE c.day >= app_private.business_today() - 400));
END
$$;

-- ------------------------------------------------------------
-- Admin configuration
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_set_lead_sla(p_value jsonb, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hours numeric;
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  BEGIN
    v_hours := (p_value ->> 'first_contact_hours')::numeric;
    IF v_hours IS NULL OR v_hours <= 0 OR v_hours > 400
       OR (p_value ->> 'workday_start')::time >= (p_value ->> 'workday_end')::time
       OR jsonb_typeof(p_value -> 'workdays') <> 'array' OR jsonb_array_length(p_value -> 'workdays') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_value -> 'workdays') d WHERE d::integer NOT BETWEEN 1 AND 7)
       OR coalesce(p_value ->> 'holiday_region', 'DE') !~ '^DE(-[A-Z]{2})?$'
       OR jsonb_typeof(p_value -> 'escalate_to_manager') <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END;
  UPDATE public.app_settings
     SET value = jsonb_build_object(
           'first_contact_hours', v_hours, 'workday_start', p_value ->> 'workday_start', 'workday_end', p_value ->> 'workday_end',
           'workdays', p_value -> 'workdays', 'holiday_region', coalesce(p_value ->> 'holiday_region', 'DE'),
           'escalate_to_manager', p_value -> 'escalate_to_manager', 'provisional', false),
         updated_at = now(), updated_by = auth.uid()
   WHERE key = 'lead_sla';
  -- Open, uncontacted leads get the new deadline.
  UPDATE public.leads SET sla_due_at = app_private.lead_sla_due(received_at)
   WHERE first_contact_at IS NULL AND closed_at IS NULL AND merged_into IS NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_save_lead_source(p_id uuid, p_name text, p_kind text, p_active boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.set_audit_context('Lead-Quelle gepflegt');
  IF p_id IS NULL THEN
    INSERT INTO public.lead_sources (name, kind, active) VALUES (btrim(p_name), p_kind, coalesce(p_active, true)) RETURNING id INTO v_id;
  ELSE
    UPDATE public.lead_sources SET name = btrim(p_name), kind = p_kind, active = coalesce(p_active, active)
     WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_lead_source_cost(p_source_id uuid, p_month date, p_amount numeric, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('finance')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  PERFORM app_private.set_audit_context('Kosten der Lead-Quelle');
  IF p_amount IS NULL THEN
    DELETE FROM public.lead_source_costs WHERE source_id = p_source_id AND month = date_trunc('month', p_month)::date;
    RETURN;
  END IF;
  IF p_amount < 0 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.lead_source_costs (source_id, month, amount, note)
  VALUES (p_source_id, date_trunc('month', p_month)::date, p_amount, nullif(btrim(coalesce(p_note, '')), ''))
  ON CONFLICT (source_id, month) DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, updated_at = now();
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_lead_stage_config(p_code text, p_required_fields text[], p_allow_skip boolean, p_active boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  IF p_code IN ('new', 'won', 'lost') AND NOT p_active THEN
    RAISE EXCEPTION 'stage_required' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_active AND EXISTS (SELECT 1 FROM public.leads WHERE stage = p_code AND merged_into IS NULL) THEN
    RAISE EXCEPTION 'stage_in_use' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.lead_stages SET required_fields = coalesce(p_required_fields, '{}'), allow_skip = p_allow_skip, active = p_active
   WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_holiday(p_day date, p_region text, p_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.set_audit_context('Feiertagskalender');
  IF nullif(btrim(coalesce(p_name, '')), '') IS NULL THEN
    DELETE FROM public.business_calendar WHERE day = p_day AND region = p_region;
  ELSE
    INSERT INTO public.business_calendar (day, region, name) VALUES (p_day, p_region, btrim(p_name))
    ON CONFLICT (day, region) DO UPDATE SET name = EXCLUDED.name;
  END IF;
  UPDATE public.leads SET sla_due_at = app_private.lead_sla_due(received_at)
   WHERE first_contact_at IS NULL AND closed_at IS NULL AND merged_into IS NULL;
END
$$;

-- ------------------------------------------------------------
-- Task generators (§9.3 alerts, §11.2)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.run_lead_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_keep     uuid[];
  v_id       uuid;
  v_mgr      uuid;
  r          record;
  v_escalate boolean := coalesce((SELECT (value ->> 'escalate_to_manager')::boolean FROM public.app_settings WHERE key = 'lead_sla'), false);
  v_breaches integer := 0;
BEGIN
  -- lead_first_contact: owned, open, never contacted → owner; overdue → high + manager notified once
  v_keep := '{}';
  FOR r IN SELECT l.id, l.owner_id, l.sla_due_at, app_private.lead_display_name(l) AS name
             FROM public.leads l JOIN public.lead_stages s ON s.code = l.stage
            WHERE l.owner_id IS NOT NULL AND l.first_contact_at IS NULL AND l.merged_into IS NULL AND s.kind = 'open' LOOP
    v_id := app_private.ensure_system_task('lead_first_contact', r.owner_id, 'Erstkontakt: ' || r.name,
              r.sla_due_at, 'lead', r.id, 'normal', '/vertrieb/leads/' || r.id);
    v_keep := array_append(v_keep, v_id);
    IF r.sla_due_at < now() THEN
      UPDATE public.tasks SET priority = 'high' WHERE id = v_id AND priority <> 'high';
      v_breaches := v_breaches + 1;
      v_mgr := app_private.active_manager_of(r.owner_id);
      IF v_escalate AND v_mgr IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.notifications n WHERE n.recipient_id = v_mgr AND n.kind = 'lead_sla_breach'
           AND n.link = '/vertrieb/leads/' || r.id) THEN
        PERFORM app_private.notify(v_mgr, 'lead_sla_breach', 'Erstkontakt überfällig: ' || r.name, NULL, '/vertrieb/leads/' || r.id);
      END IF;
    END IF;
  END LOOP;
  PERFORM app_private.close_system_tasks('lead_first_contact', v_keep, 'Kontakt erfolgt oder Lead abgegeben');

  -- lead_next_action: contacted open/nurture leads without a next step (or with an overdue one),
  -- unless an appointment is already booked
  v_keep := '{}';
  FOR r IN SELECT l.id, l.owner_id, l.next_action, l.next_action_at, app_private.lead_display_name(l) AS name
             FROM public.leads l JOIN public.lead_stages s ON s.code = l.stage
            WHERE l.owner_id IS NOT NULL AND l.merged_into IS NULL AND s.kind IN ('open', 'nurture')
              AND l.first_contact_at IS NOT NULL
              AND (l.next_action_at IS NULL OR l.next_action_at < now())
              AND NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = l.id
                                AND a.type = 'appointment' AND a.outcome IS NULL AND a.scheduled_at > now()) LOOP
    v_id := app_private.ensure_system_task('lead_next_action', r.owner_id,
              CASE WHEN r.next_action_at IS NULL THEN 'Nächsten Schritt festlegen: ' || r.name
                   ELSE left('Fällig: ' || coalesce(r.next_action, 'Nächster Schritt') || ' (' || r.name || ')', 300) END,
              coalesce(r.next_action_at, now()), 'lead', r.id, 'normal', '/vertrieb/leads/' || r.id);
    v_keep := array_append(v_keep, v_id);
  END LOOP;
  PERFORM app_private.close_system_tasks('lead_next_action', v_keep, 'Nächster Schritt geplant oder Lead geschlossen');

  -- lead_unassigned: pool leads → their creator if a leader, otherwise every active admin
  v_keep := '{}';
  FOR r IN SELECT l.id, l.sla_due_at, app_private.lead_display_name(l) AS name, t.recipient
             FROM public.leads l
             JOIN public.lead_stages s ON s.code = l.stage AND s.kind IN ('open', 'nurture')
             CROSS JOIN LATERAL (
               SELECT l.created_by AS recipient
                WHERE EXISTS (SELECT 1 FROM public.employees e WHERE e.id = l.created_by AND e.status = 'active')
                  AND EXISTS (SELECT 1 FROM app_private.descendants_at(l.created_by, app_private.business_today()))
               UNION
               SELECT e.id FROM public.employees e JOIN public.user_roles ur
                   ON ur.user_id = e.user_id AND ur.role = 'admin' AND ur.revoked_at IS NULL
                WHERE e.status = 'active'
                  AND NOT EXISTS (SELECT 1 FROM public.employees c WHERE c.id = l.created_by AND c.status = 'active'
                                    AND EXISTS (SELECT 1 FROM app_private.descendants_at(l.created_by, app_private.business_today())))
             ) t
            WHERE l.owner_id IS NULL AND l.merged_into IS NULL LOOP
    v_id := app_private.ensure_system_task('lead_unassigned', r.recipient, 'Lead zuweisen: ' || r.name,
              r.sla_due_at, 'lead', r.id, 'high', '/vertrieb/leads/' || r.id);
    v_keep := array_append(v_keep, v_id);
  END LOOP;
  PERFORM app_private.close_system_tasks('lead_unassigned', v_keep, 'Lead wurde zugewiesen');

  RETURN jsonb_build_object('lead_sla_breaches', v_breaches);
END
$$;

-- run_task_generators() = the core generators + the lead generators.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'app_private' AND p.proname = 'run_core_task_generators') THEN
    ALTER FUNCTION app_private.run_task_generators() RENAME TO run_core_task_generators;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_private.run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_leads jsonb := app_private.run_lead_task_generators();
BEGIN
  RETURN app_private.run_core_task_generators() || v_leads;
END
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
-- Policy helpers only; everything else in app_private stays private (default privileges).
GRANT EXECUTE ON FUNCTION app_private.can_see_lead(uuid), app_private.is_leader() TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.rpc_find_lead_duplicates(text, text, text, text, text, uuid),
  public.rpc_create_lead(jsonb, uuid, boolean, boolean),
  public.rpc_update_lead(uuid, jsonb),
  public.rpc_set_lead_stage(uuid, text, text, text, text, timestamptz, uuid),
  public.rpc_assign_lead(uuid, uuid, text),
  public.rpc_merge_leads(uuid, uuid, text),
  public.rpc_lead_config(),
  public.rpc_set_lead_sla(jsonb, text),
  public.rpc_save_lead_source(uuid, text, text, boolean),
  public.rpc_set_lead_source_cost(uuid, date, numeric, text),
  public.rpc_update_lead_stage_config(text, text[], boolean, boolean, text),
  public.rpc_set_holiday(date, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_find_lead_duplicates(text, text, text, text, text, uuid),
  public.rpc_create_lead(jsonb, uuid, boolean, boolean),
  public.rpc_update_lead(uuid, jsonb),
  public.rpc_set_lead_stage(uuid, text, text, text, text, timestamptz, uuid),
  public.rpc_assign_lead(uuid, uuid, text),
  public.rpc_merge_leads(uuid, uuid, text),
  public.rpc_lead_config(),
  public.rpc_set_lead_sla(jsonb, text),
  public.rpc_save_lead_source(uuid, text, text, boolean),
  public.rpc_set_lead_source_cost(uuid, date, numeric, text),
  public.rpc_update_lead_stage_config(text, text[], boolean, boolean, text),
  public.rpc_set_holiday(date, text, text)
TO authenticated;
