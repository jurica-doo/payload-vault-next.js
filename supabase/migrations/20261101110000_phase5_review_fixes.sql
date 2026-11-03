-- ============================================================
-- Phase 5 review fixes (requirements1/phase-5-crm/verification/r1-p5-verification.md)
-- ============================================================
--   P5-PRIV-01  compliance (2FA) may record opt-outs and withdrawals (never grants) and can carry
--               out an objection request in one step (rpc_apply_objection)
--   P5-UX-05    a customer follow-up can't be planned in the past (date_in_past)
--   P5-UX-06    manually linked contracts are always source 'manual'; the portal source is set by the sync
--   P5-API-01   named error keys instead of raw CHECK violations (customer texts, consents, contract
--               dates, service item titles)
--   P5-API-02   a renewal item without a contract says renewal_date_unconfirmed
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.validate_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  NEW.first_name     := nullif(btrim(NEW.first_name), '');
  NEW.last_name      := nullif(btrim(NEW.last_name), '');
  NEW.company        := nullif(btrim(NEW.company), '');
  NEW.preferred_name := nullif(btrim(NEW.preferred_name), '');
  NEW.phone          := nullif(btrim(NEW.phone), '');
  NEW.email          := nullif(lower(btrim(NEW.email)), '');
  NEW.street         := nullif(btrim(NEW.street), '');
  NEW.postal_code    := nullif(btrim(NEW.postal_code), '');
  NEW.city           := nullif(btrim(NEW.city), '');
  NEW.notes          := nullif(btrim(NEW.notes), '');
  IF length(NEW.first_name) > 100 OR length(NEW.last_name) > 100 OR length(NEW.company) > 200
     OR length(NEW.preferred_name) > 100 OR length(NEW.street) > 200 OR length(NEW.city) > 100
     OR length(NEW.notes) > 4000 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  IF NEW.postal_code IS NOT NULL AND NEW.postal_code !~ '^[0-9A-Za-z \-]{3,10}$' THEN
    RAISE EXCEPTION 'invalid_postal_code' USING ERRCODE = '22023';
  END IF;
  IF NEW.erased_at IS NULL AND NEW.last_name IS NULL AND NEW.company IS NULL THEN
    RAISE EXCEPTION 'customer_name_required' USING ERRCODE = '22023';
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF NEW.date_of_birth IS NOT NULL AND (NEW.date_of_birth > current_date OR NEW.date_of_birth < '1900-01-01') THEN
    RAISE EXCEPTION 'invalid_date_of_birth' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.erased_at IS NOT NULL AND (NEW.erased_at IS NULL OR NEW.first_name IS NOT NULL
       OR NEW.last_name IS DISTINCT FROM OLD.last_name OR NEW.phone IS NOT NULL OR NEW.email IS NOT NULL) THEN
    RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_update_customer(p_customer_id uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  c public.customers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);
  -- P5-UX-05: a follow-up planned by a user lies ahead (imports and data fixes write the table directly).
  IF (p_data ->> 'next_follow_up_at')::timestamptz < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'date_in_past' USING ERRCODE = '22023';
  END IF;
  c := app_private.apply_customer_data(c, p_data);
  PERFORM app_private.set_audit_context('Kunde bearbeitet');
  UPDATE public.customers SET
    first_name = c.first_name, last_name = c.last_name, company = c.company, preferred_name = c.preferred_name,
    date_of_birth = c.date_of_birth, phone = c.phone, email = c.email, street = c.street, postal_code = c.postal_code,
    city = c.city, preferred_channel = c.preferred_channel, status = c.status, next_follow_up_at = c.next_follow_up_at, notes = c.notes
  WHERE id = p_customer_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_create_customer(p_data jsonb, p_owner_id uuid DEFAULT NULL::uuid, p_confirm_duplicates boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_owner uuid := coalesce(p_owner_id, app_private.current_employee_id());
  c       public.customers%ROWTYPE;
BEGIN
  -- P5-UX-05: a follow-up planned by a user lies ahead (imports and data fixes write the table directly).
  IF (p_data ->> 'next_follow_up_at')::timestamptz < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'date_in_past' USING ERRCODE = '22023';
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM app_private.assert_can_write_customer(v_owner);
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_owner AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_confirm_duplicates AND EXISTS (
    SELECT 1 FROM app_private.customer_duplicates(p_data ->> 'first_name', p_data ->> 'last_name', p_data ->> 'company',
                                                  p_data ->> 'phone', p_data ->> 'email')) THEN
    RAISE EXCEPTION 'possible_duplicate' USING ERRCODE = 'P0001';
  END IF;
  c.owner_id := v_owner;
  c.created_by := v_me;
  c.preferred_channel := 'any';
  c.status := 'active';
  c := app_private.apply_customer_data(c, p_data);
  PERFORM app_private.set_audit_context('Kunde angelegt');
  INSERT INTO public.customers (first_name, last_name, company, preferred_name, date_of_birth, phone, email, street, postal_code,
                                city, preferred_channel, owner_id, status, next_follow_up_at, notes, created_by)
  VALUES (c.first_name, c.last_name, c.company, c.preferred_name, c.date_of_birth, c.phone, c.email, c.street, c.postal_code,
          c.city, c.preferred_channel, c.owner_id, c.status, c.next_follow_up_at, c.notes, c.created_by)
  RETURNING * INTO c;
  INSERT INTO public.customer_assignments (customer_id, to_owner, assigned_by, reason) VALUES (c.id, v_owner, v_me, 'Angelegt');
  RETURN c.id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_record_consent(p_customer_id uuid, p_purpose text, p_action text, p_legal_basis text, p_source text, p_evidence text DEFAULT NULL::text, p_effective_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  c    public.customers%ROWTYPE;
  v_at timestamptz := coalesce(p_effective_at, now());
  v_id bigint;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  -- P5-PRIV-01: compliance carries out objections and withdrawals (never grants); always with 2FA.
  IF p_action IN ('opt_out', 'withdrawn') AND app_private.has_role('compliance')
     AND NOT coalesce(c.owner_id = app_private.current_employee_id() OR app_private.is_manager_of(c.owner_id), false) THEN
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  ELSE
    PERFORM app_private.assert_can_write_customer(c.owner_id);
  END IF;
  IF NOT ((p_purpose = 'all' AND p_action IN ('opt_out', 'opt_in') AND p_legal_basis IS NULL)
       OR (p_purpose IN ('contact_phone', 'contact_email', 'contact_whatsapp', 'marketing_email', 'birthday_email', 'holiday_email')
           AND ((p_action = 'granted' AND p_legal_basis IN ('consent', 'contract', 'legitimate_interest', 'legal_obligation'))
             OR (p_action = 'withdrawn' AND p_legal_basis IS NULL))))
     OR p_source NOT IN ('form', 'phone', 'email', 'in_person', 'letter', 'portal', 'import', 'lead') THEN
    RAISE EXCEPTION 'consent_invalid' USING ERRCODE = '22023';
  END IF;
  IF length(p_evidence) > 1000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  IF v_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001'; END IF;
  IF v_at < '2000-01-01' THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  -- A granted consent (basis 'consent') needs evidence: where and how it was given.
  IF p_action = 'granted' AND p_legal_basis = 'consent' AND length(btrim(coalesce(p_evidence, ''))) < 5 THEN
    RAISE EXCEPTION 'consent_evidence_required' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.set_audit_context(CASE p_action
    WHEN 'granted' THEN 'Einwilligung/Rechtsgrundlage erfasst' WHEN 'withdrawn' THEN 'Widerruf erfasst'
    WHEN 'opt_out' THEN 'Widerspruch gegen Kontaktaufnahme' ELSE 'Widerspruch aufgehoben' END);
  INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by)
  VALUES (p_customer_id, p_purpose, p_action, p_legal_basis, p_source, nullif(btrim(coalesce(p_evidence, '')), ''), v_at,
          app_private.current_employee_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_save_contract_link(p_id uuid, p_customer_id uuid, p_data jsonb, p_dates_confirmed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  c        public.customers%ROWTYPE;
  k        public.contract_links%ROWTYPE;
  v_id     uuid;
  v_start  date := (p_data ->> 'start_date')::date;
  v_end    date := (p_data ->> 'end_date')::date;
  v_renew  date := (p_data ->> 'renewal_date')::date;
  v_dates  boolean;
  v_source text := coalesce(nullif(btrim(p_data ->> 'source_system'), ''), 'manual');
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) x WHERE x NOT IN (
      'source_system', 'external_contract_id', 'category_code', 'product_name', 'insurer', 'status',
      'start_date', 'end_date', 'renewal_date', 'deep_link', 'production_id')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  -- P5-UX-06: contracts linked by hand are always 'manual'; the portal source is set by the sync.
  IF v_source <> 'manual' THEN RAISE EXCEPTION 'manual_source_only' USING ERRCODE = '22023'; END IF;
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end < v_start THEN
    RAISE EXCEPTION 'contract_dates_order' USING ERRCODE = '22023';
  END IF;
  IF length(p_data ->> 'product_name') > 200 OR length(p_data ->> 'insurer') > 200
     OR length(btrim(p_data ->> 'external_contract_id')) > 200 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO k FROM public.contract_links WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    -- Synced contracts belong to the source system; only the link to production can be set here.
    IF k.date_source = 'portal' OR k.last_synced_at IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) x WHERE x <> 'production_id') THEN
        RAISE EXCEPTION 'synced_read_only' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  SELECT * INTO c FROM public.customers WHERE id = coalesce(k.customer_id, p_customer_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);

  v_dates := v_start IS NOT NULL OR v_end IS NOT NULL OR v_renew IS NOT NULL;
  IF v_dates AND NOT p_dates_confirmed AND k.last_synced_at IS NULL THEN
    RAISE EXCEPTION 'dates_unconfirmed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.check_deep_link(nullif(btrim(p_data ->> 'deep_link'), ''));
  IF (p_data ->> 'production_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_records pr
     WHERE pr.id = (p_data ->> 'production_id')::uuid AND app_private.can_see_employee(pr.producer_id)) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app_private.set_audit_context('Vertrag verknüpft');
  IF p_id IS NULL THEN
    PERFORM app_private.check_source_system(v_source);
    IF EXISTS (SELECT 1 FROM public.contract_links WHERE source_system = v_source AND external_contract_id = btrim(p_data ->> 'external_contract_id')) THEN
      RAISE EXCEPTION 'contract_exists' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.contract_links (customer_id, source_system, external_contract_id, category_code, product_name, insurer, status,
                                       start_date, end_date, renewal_date, date_source, dates_confirmed_by, deep_link, production_id, created_by)
    VALUES (c.id, v_source, btrim(p_data ->> 'external_contract_id'), nullif(p_data ->> 'category_code', ''), p_data ->> 'product_name',
            p_data ->> 'insurer', coalesce(p_data ->> 'status', 'unknown'), v_start, v_end, v_renew,
            CASE WHEN v_dates THEN 'manual_confirmed' END, CASE WHEN v_dates THEN app_private.current_employee_id() END,
            nullif(btrim(p_data ->> 'deep_link'), ''), (p_data ->> 'production_id')::uuid, app_private.current_employee_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contract_links SET
      category_code = CASE WHEN p_data ? 'category_code' THEN nullif(p_data ->> 'category_code', '') ELSE category_code END,
      product_name = CASE WHEN p_data ? 'product_name' THEN p_data ->> 'product_name' ELSE product_name END,
      insurer = CASE WHEN p_data ? 'insurer' THEN p_data ->> 'insurer' ELSE insurer END,
      status = CASE WHEN p_data ? 'status' THEN coalesce(p_data ->> 'status', 'unknown') ELSE status END,
      start_date = CASE WHEN p_data ? 'start_date' THEN v_start ELSE start_date END,
      end_date = CASE WHEN p_data ? 'end_date' THEN v_end ELSE end_date END,
      renewal_date = CASE WHEN p_data ? 'renewal_date' THEN v_renew ELSE renewal_date END,
      date_source = CASE WHEN p_data ?| ARRAY['start_date', 'end_date', 'renewal_date'] AND k.date_source IS DISTINCT FROM 'portal'
                         THEN CASE WHEN v_dates THEN 'manual_confirmed' END ELSE date_source END,
      dates_confirmed_by = CASE WHEN p_data ?| ARRAY['start_date', 'end_date', 'renewal_date'] AND k.date_source IS DISTINCT FROM 'portal'
                         THEN CASE WHEN v_dates THEN app_private.current_employee_id() END ELSE dates_confirmed_by END,
      deep_link = CASE WHEN p_data ? 'deep_link' THEN nullif(btrim(p_data ->> 'deep_link'), '') ELSE deep_link END,
      production_id = CASE WHEN p_data ? 'production_id' THEN (p_data ->> 'production_id')::uuid ELSE production_id END
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_save_service_item(p_id uuid, p_customer_id uuid, p_kind text, p_title text, p_due_on date, p_owner_id uuid DEFAULT NULL::uuid, p_recurrence text DEFAULT 'none'::text, p_contract_link_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  c      public.customers%ROWTYPE;
  i      public.customer_service_items%ROWTYPE;
  v_due  date := p_due_on;
  v_own  uuid;
  v_id   uuid;
BEGIN
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN RAISE EXCEPTION 'title_too_short' USING ERRCODE = '22023'; END IF;
  IF length(btrim(p_title)) > 200 OR length(p_note) > 2000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  -- P5-API-02: a renewal needs a contract with a confirmed renewal date.
  IF p_kind = 'contract_renewal' AND p_contract_link_id IS NULL THEN
    RAISE EXCEPTION 'renewal_date_unconfirmed' USING ERRCODE = 'P0001';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO i FROM public.customer_service_items WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    IF i.status <> 'open' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  END IF;
  SELECT * INTO c FROM public.customers WHERE id = coalesce(i.customer_id, p_customer_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);

  v_own := coalesce(p_owner_id, i.owner_id, c.owner_id);
  IF v_own <> c.owner_id AND NOT (v_own = app_private.current_employee_id() OR app_private.is_manager_of(v_own)
                                  OR (app_private.has_role('admin') AND app_private.is_aal2())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_own AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind = 'contract_renewal' THEN
    v_due := app_private.renewal_due(p_contract_link_id, c.id, app_private.business_today());
  ELSIF p_contract_link_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_links WHERE id = p_contract_link_id AND customer_id = c.id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_due IS NULL THEN RAISE EXCEPTION 'date_required' USING ERRCODE = '22023'; END IF;
  IF v_due > app_private.business_today() + 3660 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;

  PERFORM app_private.set_audit_context('Serviceanlass gepflegt');
  IF p_id IS NULL THEN
    INSERT INTO public.customer_service_items (customer_id, kind, title, due_on, owner_id, recurrence, contract_link_id, note, created_by)
    VALUES (c.id, p_kind, btrim(p_title), v_due, v_own, coalesce(p_recurrence, 'none'), p_contract_link_id,
            nullif(btrim(coalesce(p_note, '')), ''), app_private.current_employee_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.customer_service_items
       SET kind = p_kind, title = btrim(p_title), due_on = v_due, owner_id = v_own, recurrence = coalesce(p_recurrence, 'none'),
           contract_link_id = p_contract_link_id, note = nullif(btrim(coalesce(p_note, '')), '')
     WHERE id = p_id
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END
$function$

;

-- ------------------------------------------------------------
-- P5-PRIV-01: carry out an objection request in one step
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_apply_objection(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.privacy_requests%ROWTYPE;
  c public.customers%ROWTYPE;
BEGIN
  PERFORM app_private.assert_privacy_officer();
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'open' OR r.kind <> 'objection' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  -- Leads have no consent log; their objection is handled on the lead and the request closed with a note.
  IF r.subject_type <> 'customer' THEN RAISE EXCEPTION 'objection_customer_only' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO c FROM public.customers WHERE id = r.subject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;

  PERFORM app_private.set_audit_context('Widerspruch umgesetzt (DS-' || r.request_no || ')');
  INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by)
  VALUES (c.id, 'all', 'opt_out', NULL,
          CASE r.received_via WHEN 'portal' THEN 'form' ELSE r.received_via END,
          'Datenschutzanfrage DS-' || r.request_no, now(), app_private.current_employee_id());
  UPDATE public.privacy_requests
     SET status = 'completed', outcome_note = 'Widerspruch umgesetzt: keine Kontaktaufnahme mehr.',
         completed_at = now(), handled_by = auth.uid()
   WHERE id = r.id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_apply_objection(uuid)'::regprocedure);

-- ------------------------------------------------------------
-- P5-UX-02: requests carry the subject's K-/L-number, so the privacy page can name it
-- (compliance can't read leads; the number is copied when the request is opened)
-- ------------------------------------------------------------
ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS subject_no bigint;

CREATE OR REPLACE FUNCTION app_private.fill_privacy_subject_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.subject_no := CASE NEW.subject_type
    WHEN 'customer' THEN (SELECT customer_no FROM public.customers WHERE id = NEW.subject_id)
    WHEN 'lead' THEN (SELECT lead_no FROM public.leads WHERE id = NEW.subject_id) END;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS privacy_requests_subject_no ON public.privacy_requests;
CREATE TRIGGER privacy_requests_subject_no BEFORE INSERT ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION app_private.fill_privacy_subject_no();

SELECT set_config('app.reason', 'Phase-5-Review: Nummer der betroffenen Person ergänzt', true);
UPDATE public.privacy_requests r SET subject_no = coalesce(
  (SELECT customer_no FROM public.customers WHERE id = r.subject_id AND r.subject_type = 'customer'),
  (SELECT lead_no FROM public.leads WHERE id = r.subject_id AND r.subject_type = 'lead'))
 WHERE r.subject_no IS NULL;
