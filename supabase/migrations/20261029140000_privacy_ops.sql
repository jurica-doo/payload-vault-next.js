-- ============================================================
-- r1/p5/privacy-ops: data subject requests, export, erasure, retention (§12.4, §10.5)
-- ============================================================
-- privacy_requests  every access / rectification / erasure / objection
--                   request with the date received, channel, a one-month
--                   due date (Art. 12(3) GDPR) and its outcome.
-- export_log        append-only record of every personal-data export
--                   (§12.4 "record exports and bulk actions").
-- rpc_export_subject_data(request)   JSON export of everything stored about
--                   a customer or lead; needs an open ACCESS request.
-- rpc_erase_subject(request)         pseudonymisation for an open ERASURE
--                   request: identity, contact, address, birth date, notes,
--                   activity notes, consent evidence and task titles are
--                   removed; contract links, production and commission stay
--                   (records the business must keep). Never a hard delete.
-- rpc_retention_candidates()         report only: retention periods are
--                   OD-16, nothing is deleted automatically.
-- Who: compliance or admin, always with MFA (aal2). Exports are rate-limited.
-- Task titles (they contain names) are redacted in the audit log from now on.
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('retention', jsonb_build_object('customer_years', NULL, 'lead_years', NULL),
        'Aufbewahrung: Jahre nach Ende der Kundenbeziehung / nach Abschluss des Leads (OD-16, nicht festgelegt)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS erased_at timestamptz;

-- Task titles contain customer and lead names.
SELECT app_private.attach_audit('public.tasks', 'id', '{updated_at}', '{title,description,completion_note}');
SELECT app_private.attach_audit('public.customer_service_items', 'id', '{updated_at}', '{title,note}');

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no    bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind          text NOT NULL CHECK (kind IN ('access', 'rectification', 'erasure', 'objection')),
  subject_type  text NOT NULL CHECK (subject_type IN ('customer', 'lead')),
  subject_id    uuid NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  received_via  text NOT NULL CHECK (received_via IN ('email', 'letter', 'phone', 'in_person', 'portal')),
  due_at        timestamptz NOT NULL,
  note          text CHECK (note IS NULL OR length(note) <= 2000),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'rejected')),
  outcome_note  text CHECK (outcome_note IS NULL OR length(outcome_note) <= 2000),
  completed_at  timestamptz,
  handled_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_request_closed CHECK ((status = 'open') = (completed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_open ON public.privacy_requests (status, due_at);

CREATE TABLE IF NOT EXISTS public.export_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  kind        text NOT NULL,
  entity_type text,
  entity_id   uuid,
  row_count   integer,
  request_id  uuid REFERENCES public.privacy_requests (id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS privacy_requests_touch ON public.privacy_requests;
CREATE TRIGGER privacy_requests_touch BEFORE UPDATE ON public.privacy_requests FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.privacy_requests', 'id', '{updated_at}', '{note,outcome_note}');
DROP TRIGGER IF EXISTS export_log_append_only ON public.export_log;
CREATE TRIGGER export_log_append_only BEFORE UPDATE OR DELETE ON public.export_log FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_requests_select ON public.privacy_requests;
CREATE POLICY privacy_requests_select ON public.privacy_requests FOR SELECT TO authenticated
  USING (app_private.has_role('compliance') OR app_private.has_role('admin'));
DROP POLICY IF EXISTS export_log_select ON public.export_log;
CREATE POLICY export_log_select ON public.export_log FOR SELECT TO authenticated
  USING (app_private.has_role('compliance') OR app_private.has_role('admin'));
REVOKE ALL ON public.privacy_requests, public.export_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.privacy_requests, public.export_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.privacy_requests TO service_role;
GRANT SELECT, INSERT ON public.export_log TO service_role;

-- Consent evidence may be removed by an erasure, nothing else may change.
CREATE OR REPLACE FUNCTION app_private.consent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.privacy_erasure', true) = 'on'
     AND NEW.evidence IS NULL
     AND (to_jsonb(NEW) - 'evidence') = (to_jsonb(OLD) - 'evidence') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'append_only' USING ERRCODE = '42501';
END
$$;
DROP TRIGGER IF EXISTS customer_consents_append_only ON public.customer_consents;
CREATE TRIGGER customer_consents_append_only BEFORE UPDATE OR DELETE ON public.customer_consents
  FOR EACH ROW EXECUTE FUNCTION app_private.consent_guard();

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.assert_privacy_officer()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('compliance') OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_private.open_request(p_id uuid, p_kind text)
RETURNS public.privacy_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.privacy_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  IF r.kind <> p_kind THEN RAISE EXCEPTION 'wrong_request_kind' USING ERRCODE = 'P0001'; END IF;
  RETURN r;
END
$$;

-- ------------------------------------------------------------
-- Requests
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_open_privacy_request(
  p_kind text, p_subject_type text, p_subject_id uuid, p_received_via text, p_note text DEFAULT NULL, p_received_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_at timestamptz := coalesce(p_received_at, now());
  v_id uuid;
BEGIN
  PERFORM app_private.assert_privacy_officer();
  IF v_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001'; END IF;
  IF (p_subject_type = 'customer' AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_subject_id))
     OR (p_subject_type = 'lead' AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_subject_id)) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app_private.set_audit_context('Datenschutzanfrage erfasst');
  INSERT INTO public.privacy_requests (kind, subject_type, subject_id, received_at, received_via, due_at, note, created_by)
  VALUES (p_kind, p_subject_type, p_subject_id, v_at, p_received_via, v_at + interval '1 month',
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Customer/lead by its number (K-…/L-…) for opening a request. Compliance
-- has no lead access otherwise, so only the id and the status come back.
CREATE OR REPLACE FUNCTION public.rpc_find_privacy_subject(p_subject_type text, p_number bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('compliance') OR app_private.has_role('admin')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN CASE p_subject_type
    WHEN 'customer' THEN (SELECT jsonb_build_object('id', id, 'erased', erased_at IS NOT NULL) FROM public.customers WHERE customer_no = p_number)
    WHEN 'lead' THEN (SELECT jsonb_build_object('id', id, 'erased', erased_at IS NOT NULL, 'customer_id', customer_id) FROM public.leads WHERE lead_no = p_number)
  END;
END
$$;

-- Rectification and objection are handled in the normal screens; this closes them (or rejects any request).
CREATE OR REPLACE FUNCTION public.rpc_close_privacy_request(p_id uuid, p_status text, p_outcome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.privacy_requests%ROWTYPE;
BEGIN
  PERFORM app_private.assert_privacy_officer();
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'open' OR p_status NOT IN ('completed', 'rejected') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  -- Access and erasure are completed by doing them, so the outcome is always on record.
  IF p_status = 'completed' AND r.kind IN ('access', 'erasure') THEN RAISE EXCEPTION 'use_dedicated_action' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.require_reason(p_outcome);
  UPDATE public.privacy_requests SET status = p_status, outcome_note = btrim(p_outcome), completed_at = now(), handled_by = auth.uid()
   WHERE id = p_id;
END
$$;

-- ------------------------------------------------------------
-- Export (access request)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.subject_data(p_type text, p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_type
    WHEN 'customer' THEN jsonb_build_object(
      'customer', (SELECT to_jsonb(c) - 'search_name' FROM public.customers c WHERE c.id = p_id),
      'adviser_history', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.assigned_at), '[]') FROM public.customer_assignments a WHERE a.customer_id = p_id),
      'consents', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.effective_at), '[]') FROM public.customer_consents x WHERE x.customer_id = p_id),
      'contracts', (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.created_at), '[]') FROM public.contract_links k WHERE k.customer_id = p_id),
      'service_items', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.due_on), '[]') FROM public.customer_service_items i WHERE i.customer_id = p_id),
      'activities', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.occurred_at), '[]') FROM public.activities a
                      WHERE (a.linked_type = 'customer' AND a.linked_id = p_id)
                         OR (a.linked_type = 'lead' AND a.linked_id = (SELECT lead_id FROM public.customers WHERE id = p_id))),
      'lead', (SELECT to_jsonb(l) - 'search_name' FROM public.leads l WHERE l.id = (SELECT lead_id FROM public.customers WHERE id = p_id)))
    ELSE jsonb_build_object(
      'lead', (SELECT to_jsonb(l) - 'search_name' FROM public.leads l WHERE l.id = p_id),
      'stage_history', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.changed_at), '[]') FROM public.lead_stage_history h WHERE h.lead_id = p_id),
      'assignments', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.assigned_at), '[]') FROM public.lead_assignments a WHERE a.lead_id = p_id),
      'activities', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.occurred_at), '[]') FROM public.activities a
                      WHERE a.linked_type = 'lead' AND a.linked_id = p_id))
  END
$$;

CREATE OR REPLACE FUNCTION public.rpc_export_subject_data(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r      public.privacy_requests%ROWTYPE;
  v_data jsonb;
BEGIN
  PERFORM app_private.assert_privacy_officer();
  r := app_private.open_request(p_request_id, 'access');
  IF NOT public.consume_rate_limit('privacy_export:' || auth.uid()::text, 20, 3600) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  v_data := app_private.subject_data(r.subject_type, r.subject_id);
  INSERT INTO public.export_log (actor_id, kind, entity_type, entity_id, row_count, request_id)
  VALUES (auth.uid(), 'subject_access', r.subject_type, r.subject_id,
          (SELECT count(*) FROM jsonb_each(v_data) e, LATERAL (SELECT CASE jsonb_typeof(e.value) WHEN 'array' THEN jsonb_array_length(e.value) ELSE 1 END AS n) x
            WHERE e.value <> 'null'::jsonb)::integer, r.id);
  PERFORM app_private.set_audit_context('Auskunft erteilt');
  UPDATE public.privacy_requests SET status = 'completed', completed_at = now(), handled_by = auth.uid(),
         outcome_note = 'Datenexport erstellt'
   WHERE id = r.id;
  RETURN jsonb_build_object('request_no', r.request_no, 'exported_at', now(), 'subject_type', r.subject_type, 'data', v_data);
END
$$;

-- ------------------------------------------------------------
-- Erasure (pseudonymisation)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.erase_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.leads
     SET first_name = NULL, last_name = NULL, company = 'Gelöscht (Datenschutz)', phone = NULL, email = NULL,
         campaign = NULL, referral = NULL, region = NULL, notes = NULL, next_action = NULL, next_action_at = NULL,
         erased_at = now(), closed_at = coalesce(closed_at, now())
   WHERE id = p_lead_id AND erased_at IS NULL;
  UPDATE public.activities SET notes = NULL WHERE linked_type = 'lead' AND linked_id = p_lead_id;
  UPDATE public.tasks SET title = 'Gelöscht (Datenschutz)', description = NULL,
         status = CASE WHEN status = 'open' THEN 'cancelled' ELSE status END,
         completed_at = coalesce(completed_at, now())
   WHERE linked_type = 'lead' AND linked_id = p_lead_id;
  UPDATE public.notifications SET title = 'Gelöscht (Datenschutz)', body = NULL WHERE link = '/vertrieb/leads/' || p_lead_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_erase_subject(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r      public.privacy_requests%ROWTYPE;
  v_lead uuid;
BEGIN
  PERFORM app_private.assert_privacy_officer();
  r := app_private.open_request(p_request_id, 'erasure');
  PERFORM app_private.set_audit_context('Löschung (Pseudonymisierung) nach Anfrage DS-' || r.request_no);
  PERFORM set_config('app.privacy_erasure', 'on', true);

  IF r.subject_type = 'customer' THEN
    SELECT lead_id INTO v_lead FROM public.customers WHERE id = r.subject_id FOR UPDATE;
    UPDATE public.customers
       SET first_name = NULL, last_name = NULL, company = NULL, preferred_name = NULL, date_of_birth = NULL,
           phone = NULL, email = NULL, street = NULL, postal_code = NULL, city = NULL, notes = NULL,
           next_follow_up_at = NULL, source_system = NULL, external_id = NULL, status = 'former',
           archived_at = coalesce(archived_at, now()), erased_at = now()
     WHERE id = r.subject_id AND erased_at IS NULL;
    UPDATE public.customer_consents SET evidence = NULL WHERE customer_id = r.subject_id AND evidence IS NOT NULL;
    UPDATE public.activities SET notes = NULL WHERE linked_type = 'customer' AND linked_id = r.subject_id;
    UPDATE public.customer_service_items
       SET title = 'Serviceanlass', note = NULL,
           status = CASE WHEN status = 'open' THEN 'cancelled' ELSE status END, completed_at = coalesce(completed_at, now())
     WHERE customer_id = r.subject_id;
    UPDATE public.tasks SET title = 'Gelöscht (Datenschutz)', description = NULL,
           status = CASE WHEN status = 'open' THEN 'cancelled' ELSE status END, completed_at = coalesce(completed_at, now())
     WHERE linked_type = 'customer' AND linked_id = r.subject_id;
    UPDATE public.notifications SET title = 'Gelöscht (Datenschutz)', body = NULL WHERE link = '/vertrieb/kunden/' || r.subject_id;
    IF v_lead IS NOT NULL THEN PERFORM app_private.erase_lead(v_lead); END IF;
  ELSE
    PERFORM app_private.erase_lead(r.subject_id);
  END IF;

  PERFORM set_config('app.privacy_erasure', 'off', true);
  UPDATE public.privacy_requests
     SET status = 'completed', completed_at = now(), handled_by = auth.uid(),
         outcome_note = 'Personenbezogene Daten pseudonymisiert; Vertrags- und Abrechnungsdaten aufbewahrt'
   WHERE id = r.id;
END
$$;

-- ------------------------------------------------------------
-- Retention report (OD-16)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_retention_candidates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s       jsonb := (SELECT value FROM public.app_settings WHERE key = 'retention');
  v_cust  integer := (s ->> 'customer_years')::integer;
  v_leads integer := (s ->> 'lead_years')::integer;
BEGIN
  IF NOT (app_private.has_role('compliance') OR app_private.has_role('admin')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'customer_years', v_cust, 'lead_years', v_leads,
    'customers', CASE WHEN v_cust IS NULL THEN NULL ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'customer_no', c.customer_no, 'inactive_since', x.since) ORDER BY x.since)
        FROM public.customers c
        CROSS JOIN LATERAL (SELECT greatest(c.updated_at, coalesce(c.archived_at, c.updated_at),
                                            coalesce((SELECT max(a.occurred_at) FROM public.activities a WHERE a.linked_type = 'customer' AND a.linked_id = c.id), c.updated_at),
                                            coalesce((SELECT max(k.updated_at) FROM public.contract_links k WHERE k.customer_id = c.id), c.updated_at)) AS since) x
       WHERE c.erased_at IS NULL AND (c.archived_at IS NOT NULL OR c.status = 'former')
         AND NOT EXISTS (SELECT 1 FROM public.contract_links k WHERE k.customer_id = c.id AND k.status IN ('active', 'pending') AND k.archived_at IS NULL)
         AND x.since < now() - make_interval(years => v_cust)), '[]') END,
    'leads', CASE WHEN v_leads IS NULL THEN NULL ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'lead_no', l.lead_no, 'closed_at', l.closed_at) ORDER BY l.closed_at)
        FROM public.leads l
       WHERE l.erased_at IS NULL AND l.customer_id IS NULL AND l.closed_at < now() - make_interval(years => v_leads)), '[]') END);
END
$$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_find_privacy_subject(text, bigint),
  public.rpc_open_privacy_request(text, text, uuid, text, text, timestamptz), public.rpc_close_privacy_request(uuid, text, text),
  public.rpc_export_subject_data(uuid), public.rpc_erase_subject(uuid), public.rpc_retention_candidates()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_find_privacy_subject(text, bigint),
  public.rpc_open_privacy_request(text, text, uuid, text, text, timestamptz), public.rpc_close_privacy_request(uuid, text, text),
  public.rpc_export_subject_data(uuid), public.rpc_erase_subject(uuid), public.rpc_retention_candidates()
TO authenticated;
