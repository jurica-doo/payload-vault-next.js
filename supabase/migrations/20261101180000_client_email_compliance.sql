-- ============================================================
-- Client e-mail: salutation, signature, legal footer, unsubscribe
-- ============================================================
-- Before automatic mail to real clients may be switched on (Gate E):
--
--  * Salutation: customers.salutation (frau / herr / divers); merge fields
--    {{briefanrede}} ("Liebe Frau Kowalski") and {{briefanrede_formell}}
--    ("Sehr geehrte Frau Kowalski"); both fall back to "Guten Tag Vorname
--    Nachname", so they never block a mail.
--  * Every rendered mail (preview, test, live) ends with a footer the
--    template author can't remove: the adviser's signature, the sender's
--    mandatory company details (app_settings 'email_sender') and an
--    unsubscribe link (UWG § 7, Art. 21 GDPR).
--  * Unsubscribe: customers.email_token (random, per customer) + the consent
--    purpose of the mail. public.rpc_unsubscribe_email (service role, called
--    by the public Edge Function email-unsubscribe) records a withdrawal for
--    that purpose (source 'unsubscribe_link'); from then on the send-time
--    check blocks every mail of that kind.
--  * Sending can only be switched on with complete sender details
--    ('sender_details_missing').
-- ============================================================

-- ------------------------------------------------------------
-- Customer columns
-- ------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS salutation text CHECK (salutation IS NULL OR salutation IN ('frau', 'herr', 'divers')),
  ADD COLUMN IF NOT EXISTS email_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_token ON public.customers (email_token);
COMMENT ON COLUMN public.customers.salutation IS 'Anrede for letters and e-mails: frau / herr / divers (neutral "Guten Tag …").';
COMMENT ON COLUMN public.customers.email_token IS 'Secret per customer for the unsubscribe link in e-mails; never shown in the app.';

-- Unsubscribe link as consent source.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.customer_consents'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%''lead''::text%' AND pg_get_constraintdef(oid) LIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.customer_consents DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$$;
ALTER TABLE public.customer_consents ADD CONSTRAINT customer_consents_source_check
  CHECK (source IN ('form', 'phone', 'email', 'in_person', 'letter', 'portal', 'import', 'lead', 'unsubscribe_link'));

-- ------------------------------------------------------------
-- Customer data: salutation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.apply_customer_data(c public.customers, p jsonb)
RETURNS public.customers
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN (
      'first_name', 'last_name', 'company', 'preferred_name', 'date_of_birth', 'phone', 'email', 'street', 'postal_code',
      'city', 'preferred_channel', 'status', 'next_follow_up_at', 'notes', 'salutation')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p ? 'first_name' THEN c.first_name := p ->> 'first_name'; END IF;
  IF p ? 'last_name' THEN c.last_name := p ->> 'last_name'; END IF;
  IF p ? 'company' THEN c.company := p ->> 'company'; END IF;
  IF p ? 'preferred_name' THEN c.preferred_name := p ->> 'preferred_name'; END IF;
  IF p ? 'date_of_birth' THEN c.date_of_birth := (p ->> 'date_of_birth')::date; END IF;
  IF p ? 'phone' THEN c.phone := p ->> 'phone'; END IF;
  IF p ? 'email' THEN c.email := p ->> 'email'; END IF;
  IF p ? 'street' THEN c.street := p ->> 'street'; END IF;
  IF p ? 'postal_code' THEN c.postal_code := p ->> 'postal_code'; END IF;
  IF p ? 'city' THEN c.city := p ->> 'city'; END IF;
  IF p ? 'preferred_channel' THEN c.preferred_channel := coalesce(p ->> 'preferred_channel', 'any'); END IF;
  IF p ? 'status' THEN c.status := coalesce(p ->> 'status', 'active'); END IF;
  IF p ? 'next_follow_up_at' THEN c.next_follow_up_at := (p ->> 'next_follow_up_at')::timestamptz; END IF;
  IF p ? 'notes' THEN c.notes := p ->> 'notes'; END IF;
  IF p ? 'salutation' THEN
    c.salutation := nullif(p ->> 'salutation', '');
    IF c.salutation IS NOT NULL AND c.salutation NOT IN ('frau', 'herr', 'divers') THEN
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN c;
END
$$;

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
    city = c.city, preferred_channel = c.preferred_channel, status = c.status, next_follow_up_at = c.next_follow_up_at, notes = c.notes,
    salutation = c.salutation
  WHERE id = p_customer_id;
END
$function$;
SELECT app_private.publish_rpc('app_rpc.rpc_update_customer(uuid, jsonb)'::regprocedure);

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
  PERFORM pg_advisory_xact_lock(hashtextextended(k, 0))
     FROM (SELECT DISTINCT k FROM unnest(ARRAY[
             'customer:phone:' || nullif(btrim(p_data ->> 'phone'), ''),
             'customer:email:' || nullif(lower(btrim(p_data ->> 'email')), '')]) AS k
           WHERE k IS NOT NULL ORDER BY k) AS keys;
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
                                city, preferred_channel, owner_id, status, next_follow_up_at, notes, created_by, salutation)
  VALUES (c.first_name, c.last_name, c.company, c.preferred_name, c.date_of_birth, c.phone, c.email, c.street, c.postal_code,
          c.city, c.preferred_channel, c.owner_id, c.status, c.next_follow_up_at, c.notes, c.created_by, c.salutation)
  RETURNING * INTO c;
  INSERT INTO public.customer_assignments (customer_id, to_owner, assigned_by, reason) VALUES (c.id, v_owner, v_me, 'Angelegt');
  RETURN c.id;
END
$function$;
SELECT app_private.publish_rpc('app_rpc.rpc_create_customer(jsonb, uuid, boolean)'::regprocedure);

-- ------------------------------------------------------------
-- Merge fields: salutation lines
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.merge_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY['vorname', 'nachname', 'rufname', 'name', 'briefanrede', 'briefanrede_formell', 'berater_vorname',
                   'berater_name', 'berater_email', 'berater_telefon', 'jahr'] $$;

-- "Liebe Frau Kowalski" / "Sehr geehrte Frau Kowalski"; without a gendered
-- salutation (or last name) the neutral "Guten Tag Sabine Kowalski".
CREATE OR REPLACE FUNCTION app_private.salutation_line(p_salutation text, p_first text, p_last text, p_formal boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_salutation = 'frau' AND nullif(btrim(p_last), '') IS NOT NULL
      THEN CASE WHEN p_formal THEN 'Sehr geehrte Frau ' ELSE 'Liebe Frau ' END || btrim(p_last)
    WHEN p_salutation = 'herr' AND nullif(btrim(p_last), '') IS NOT NULL
      THEN CASE WHEN p_formal THEN 'Sehr geehrter Herr ' ELSE 'Lieber Herr ' END || btrim(p_last)
    ELSE btrim('Guten Tag ' || btrim(coalesce(p_first, '') || ' ' || coalesce(p_last, '')))
  END
$$;
REVOKE EXECUTE ON FUNCTION app_private.salutation_line(text, text, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.merge_values(p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_customer_id IS NULL THEN jsonb_build_object(
           'vorname', 'Erika', 'nachname', 'Mustermann', 'rufname', 'Erika', 'name', 'Erika Mustermann',
           'briefanrede', 'Liebe Frau Mustermann', 'briefanrede_formell', 'Sehr geehrte Frau Mustermann',
           'berater_vorname', 'Max', 'berater_name', 'Max Berater', 'berater_email', 'max.berater@profina.example',
           'berater_telefon', '+49 170 0000000', 'jahr', extract(year FROM app_private.business_today())::text)
         ELSE (SELECT jsonb_build_object(
           'vorname', c.first_name, 'nachname', c.last_name,
           'rufname', coalesce(c.preferred_name, c.first_name),
           'name', nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
           'briefanrede', app_private.salutation_line(c.salutation, c.first_name, c.last_name, false),
           'briefanrede_formell', app_private.salutation_line(c.salutation, c.first_name, c.last_name, true),
           'berater_vorname', e.first_name, 'berater_name', e.first_name || ' ' || e.last_name,
           'berater_email', e.email, 'berater_telefon', e.phone,
           'jahr', extract(year FROM app_private.business_today())::text)
           FROM public.customers c JOIN public.employees e ON e.id = c.owner_id WHERE c.id = p_customer_id) END
$$;

-- ------------------------------------------------------------
-- Sender details (Pflichtangaben) and the footer
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES ('email_sender', '{}'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Complete = everything a business e-mail of a GmbH must carry, plus the
-- address of the app for the unsubscribe page.
CREATE OR REPLACE FUNCTION app_private.email_sender_complete(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(length(btrim(p ->> 'company')) > 1 AND length(btrim(p ->> 'address')) > 5
     AND length(btrim(p ->> 'register')) > 3 AND length(btrim(p ->> 'management')) > 2
     AND (p ->> 'contact_email') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     AND (p ->> 'app_url') ~ '^https?://[^\s/]+[^\s]*$', false)
$$;
REVOKE EXECUTE ON FUNCTION app_private.email_sender_complete(jsonb) FROM PUBLIC, anon, authenticated;

-- Footer of every client mail. p_customer_id NULL = sample (preview, test).
CREATE OR REPLACE FUNCTION app_private.email_footer(p_customer_id uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s       jsonb := coalesce((SELECT value FROM public.app_settings WHERE key = 'email_sender'), '{}'::jsonb);
  m       jsonb := app_private.merge_values(p_customer_id);
  v_token uuid;
  v_url   text;
  v_lines text[];
  v_sign  text;
BEGIN
  IF p_customer_id IS NULL THEN
    v_token := '00000000-0000-0000-0000-000000000000';
  ELSE
    SELECT email_token INTO v_token FROM public.customers WHERE id = p_customer_id;
  END IF;
  v_url := rtrim(coalesce(s ->> 'app_url', ''), '/') || '/abmelden?t=' || v_token || '&z=' || app_private.consent_purpose_for(p_purpose);

  v_sign := concat_ws(' · ', nullif(m ->> 'berater_name', ''), nullif(m ->> 'berater_telefon', ''), nullif(m ->> 'berater_email', ''));
  v_lines := ARRAY[
    CASE WHEN v_sign <> '' THEN 'Ihr Ansprechpartner: ' || v_sign END,
    nullif(concat_ws(' · ', nullif(s ->> 'company', ''), nullif(s ->> 'address', '')), ''),
    nullif(concat_ws(' · ', nullif(s ->> 'register', ''),
                     CASE WHEN nullif(s ->> 'management', '') IS NOT NULL THEN 'Geschäftsführung: ' || (s ->> 'management') END,
                     nullif(s ->> 'contact_email', '')), '')];
  v_lines := array_remove(v_lines, NULL);

  RETURN jsonb_build_object(
    'unsubscribe_url', v_url,
    'text', E'\n\n-- \n' || array_to_string(v_lines, E'\n')
            || E'\n\nSie möchten keine E-Mails dieser Art mehr erhalten? Abmelden: ' || v_url,
    'html', '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px">'
            || '<p style="font-size:12px;color:#666;line-height:1.5">'
            || array_to_string(ARRAY(SELECT app_private.escape_html(x) FROM unnest(v_lines) x), '<br>')
            || '</p><p style="font-size:12px;color:#666">Sie möchten keine E-Mails dieser Art mehr erhalten? '
            || '<a href="' || app_private.escape_html(v_url) || '">Hier abmelden</a>.</p>');
END
$$;
REVOKE EXECUTE ON FUNCTION app_private.email_footer(uuid, text) FROM PUBLIC, anon, authenticated;

-- Every rendered mail carries the footer (preview, test and live).
CREATE OR REPLACE FUNCTION app_private.render_email(p_version_id uuid, p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r || jsonb_build_object(
           'text', (r ->> 'text') || (f ->> 'text'),
           'html', (r ->> 'html') || (f ->> 'html'),
           'unsubscribe_url', f ->> 'unsubscribe_url')
    FROM public.email_template_versions v
    JOIN public.email_templates t ON t.id = v.template_id
    CROSS JOIN LATERAL (SELECT app_private.render_text(v.subject, v.body, app_private.merge_values(p_customer_id)) AS r) x
    CROSS JOIN LATERAL (SELECT app_private.email_footer(p_customer_id, t.purpose) AS f) y
   WHERE v.id = p_version_id
$$;

-- Sender details: admins (2FA) write, communication officers read.
CREATE OR REPLACE FUNCTION app_rpc.rpc_email_sender()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE s jsonb := coalesce((SELECT value FROM public.app_settings WHERE key = 'email_sender'), '{}'::jsonb);
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('compliance')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN s || jsonb_build_object('complete', app_private.email_sender_complete(s));
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_email_sender()'::regprocedure);

CREATE OR REPLACE FUNCTION app_rpc.rpc_set_email_sender(p_value jsonb, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v jsonb;
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'object' OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN ('company', 'address', 'register', 'management', 'contact_email', 'app_url')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_object_agg(key, btrim(value)) INTO v FROM jsonb_each_text(p_value) WHERE length(btrim(value)) > 0;
  v := coalesce(v, '{}'::jsonb);
  IF EXISTS (SELECT 1 FROM jsonb_each_text(v) WHERE length(value) > 300) THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  IF v ? 'contact_email' AND NOT (v ->> 'contact_email') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF v ? 'app_url' AND NOT (v ->> 'app_url') ~ '^https?://[^\s/]+[^\s]*$' THEN
    RAISE EXCEPTION 'invalid_url' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.set_audit_context(app_private.require_reason(p_reason));
  UPDATE public.app_settings SET value = v, updated_at = now(), updated_by = auth.uid() WHERE key = 'email_sender';
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_set_email_sender(jsonb, text)'::regprocedure);

-- Switching sending on needs complete sender details.
CREATE OR REPLACE FUNCTION app_rpc.rpc_set_email_enabled(p_enabled boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_comms_officer();
  -- Anyone responsible may stop sending; only admins may start it.
  IF p_enabled AND NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM app_private.require_reason(p_reason);
  IF p_enabled AND NOT app_private.email_sender_complete(
       coalesce((SELECT value FROM public.app_settings WHERE key = 'email_sender'), '{}'::jsonb)) THEN
    RAISE EXCEPTION 'sender_details_missing' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.app_settings SET value = jsonb_set(value, '{enabled}', to_jsonb(p_enabled)), updated_at = now(), updated_by = auth.uid()
   WHERE key = 'email';
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_set_email_enabled(boolean, text)'::regprocedure);

-- ------------------------------------------------------------
-- Unsubscribe (service role only; called by the Edge Function)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_unsubscribe_email(p_token uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer uuid;
  v_last     text;
BEGIN
  IF p_purpose IS NULL OR p_purpose NOT IN ('birthday_email', 'holiday_email', 'marketing_email', 'contact_email') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_link');
  END IF;
  SELECT id INTO v_customer FROM public.customers WHERE email_token = p_token AND erased_at IS NULL;
  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_link');
  END IF;
  SELECT action INTO v_last FROM public.customer_consents
   WHERE customer_id = v_customer AND purpose = p_purpose ORDER BY effective_at DESC, id DESC LIMIT 1;
  -- Idempotent: a second click changes nothing.
  IF v_last IS DISTINCT FROM 'withdrawn' THEN
    PERFORM app_private.set_audit_context('Abmeldung über den Link in einer E-Mail');
    INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by)
    VALUES (v_customer, p_purpose, 'withdrawn', NULL, 'unsubscribe_link', 'Abmeldelink in einer E-Mail angeklickt', now(), NULL);
  END IF;
  RETURN jsonb_build_object('ok', true, 'purpose', p_purpose);
END
$$;
REVOKE EXECUTE ON FUNCTION public.rpc_unsubscribe_email(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_unsubscribe_email(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- Claim: test mails with footer, unsubscribe URL for the mail headers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_email_sends(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s        jsonb := (SELECT value FROM public.app_settings WHERE key = 'email');
  v_live   boolean := coalesce((s ->> 'enabled')::boolean, false) AND app_private.in_send_window();
  v_left   integer;
  l        public.email_send_log%ROWTYPE;
  v_camp   public.email_campaigns%ROWTYPE;
  v_block  jsonb;
  v_r      jsonb;
  v_out    jsonb := '[]'::jsonb;
BEGIN
  -- Crashed workers: hand "sending" rows back after 15 minutes (the log id is the provider idempotency key).
  UPDATE public.email_send_log SET status = 'queued' WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes';

  v_left := greatest(0, coalesce((s ->> 'daily_limit')::integer, 0) - (
    SELECT count(*)::integer FROM public.email_send_log
     WHERE mode = 'live' AND status IN ('sending', 'sent', 'delivered', 'bounced')
       AND claimed_at >= (app_private.business_today()::timestamp AT TIME ZONE 'Europe/Berlin')));

  FOR l IN SELECT * FROM public.email_send_log
            WHERE status = 'queued' AND (mode = 'test' OR v_live)
            ORDER BY mode DESC, created_at
            LIMIT least(greatest(p_limit, 0), 200)
            FOR UPDATE SKIP LOCKED LOOP
    IF l.mode = 'live' THEN
      SELECT * INTO v_camp FROM public.email_campaigns WHERE id = l.campaign_id;
      IF l.occasion_date < app_private.business_today() THEN
        UPDATE public.email_send_log SET status = 'expired', suppression_reason = 'occasion_passed' WHERE id = l.id;
        CONTINUE;
      END IF;
      IF v_camp.status = 'cancelled' THEN
        UPDATE public.email_send_log SET status = 'suppressed', suppression_reason = 'campaign_cancelled' WHERE id = l.id;
        CONTINUE;
      END IF;
      CONTINUE WHEN v_camp.status = 'paused' OR v_left <= 0;
      -- Consent, basis, suppression and data are checked again at send time (§14.6).
      v_block := app_private.email_block_reason(l.customer_id, l.campaign_id);
      IF v_block ->> 'reason' IS NOT NULL THEN
        UPDATE public.email_send_log SET status = 'suppressed', suppression_reason = v_block ->> 'reason', recipient = NULL WHERE id = l.id;
        CONTINUE;
      END IF;
      v_r := app_private.render_email(l.template_version_id, l.customer_id);
      UPDATE public.email_send_log SET status = 'sending', claimed_at = now(), attempts = attempts + 1,
             recipient = v_block ->> 'recipient', legal_basis = v_block ->> 'legal_basis'
       WHERE id = l.id;
      v_left := v_left - 1;
    ELSE
      -- Test mails look exactly like a live mail, footer included (sample data).
      v_r := app_private.render_email(l.template_version_id, NULL);
      v_r := jsonb_set(v_r, '{subject}', to_jsonb('[TEST] ' || (v_r ->> 'subject')));
      UPDATE public.email_send_log SET status = 'sending', claimed_at = now(), attempts = attempts + 1 WHERE id = l.id;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', l.id, 'idempotency_key', l.id, 'to', (SELECT recipient FROM public.email_send_log WHERE id = l.id),
      'subject', v_r ->> 'subject', 'text', v_r ->> 'text', 'html', v_r ->> 'html',
      'unsubscribe_url', v_r ->> 'unsubscribe_url'));
  END LOOP;
  RETURN v_out;
END
$$;

