-- ============================================================
-- Operator defaults (2026-11-21)
-- ============================================================
-- The app is run by Bazilije Vuletić (sole trader, bound insurance agent
-- under § 34d Abs. 7 GewO) on behalf of Profina Deutschland GmbH, Lüdenscheid
-- office, at https://payload-vault.profina-vuletic.de (data from the
-- Impressum of profina-vuletic.de).
--
--  * Sender details: operator, address, Vermittlerregister number, contact
--    e-mail and app address. A sole trader has no Handelsregister entry and
--    no Geschäftsführung, so `register` / `management` are no longer required
--    for the details to count as complete.
--  * Personal sender per adviser: client mails go out as
--    "<Adviser name> <tag@domain>" with Reply-To = the adviser's own e-mail;
--    tag = the local part of the adviser's e-mail. The domain is the edge
--    function secret EMAIL_SENDER_DOMAIN (verified in Resend); account e-mails
--    and test mails keep EMAIL_FROM (noreply@…).
--  * Lead SLA default (OD-19): first contact within 8 business hours (= the
--    next working day), Mon–Fri 09:00–17:00, NRW holidays, escalation to the
--    manager. Saved as decided (no provisional notice); admins can change it.
--  * Retention default (OD-16): customers 10 years after the relationship
--    ends (HGB/AO), leads 2 years after closing without a contract. Still a
--    report only: deletion runs through an erasure request.
-- ============================================================

-- ------------------------------------------------------------
-- Sender details
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.email_sender_complete(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(length(btrim(p ->> 'company')) > 1 AND length(btrim(p ->> 'address')) > 5
     AND (p ->> 'contact_email') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     AND (p ->> 'app_url') ~ '^https?://[^\s/]+[^\s]*$', false)
$$;
REVOKE EXECUTE ON FUNCTION app_private.email_sender_complete(jsonb) FROM PUBLIC, anon, authenticated;

-- Only replaces the empty value or the earlier prefill (never what an admin saved).
UPDATE public.app_settings
   SET value = jsonb_build_object(
         'company', 'Bazilije Vuletić, Versicherungsvermittlung in Vertretung der Profina Deutschland GmbH',
         'address', 'Kölner Str. 152, 58509 Lüdenscheid',
         'register', 'Vermittlerregister D-6FME-UFOB4-98',
         'contact_email', 'vuletic@pro-fina.de',
         'app_url', 'https://payload-vault.profina-vuletic.de')
 WHERE key = 'email_sender'
   AND (value = '{}'::jsonb
        OR value = jsonb_build_object('company', 'Profina Deutschland GmbH', 'address', 'Castroper Straße 270–280, 44791 Bochum'));

-- ------------------------------------------------------------
-- Personal sender address per adviser
-- ------------------------------------------------------------
-- Local part of an e-mail, reduced to what is safe in an address.
CREATE OR REPLACE FUNCTION app_private.sender_tag(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(btrim(regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'), '.-_'), '')
$$;
REVOKE EXECUTE ON FUNCTION app_private.sender_tag(text) FROM PUBLIC, anon, authenticated;

-- Same as 20261101180000, plus sender_name / sender_tag / reply_to of the
-- customer's adviser on live mails (test mails: none → EMAIL_FROM).
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
  v_sender jsonb;
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
    v_sender := NULL;
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
      SELECT jsonb_build_object('sender_name', btrim(e.first_name || ' ' || e.last_name),
                                'sender_tag', app_private.sender_tag(e.email), 'reply_to', e.email)
        INTO v_sender
        FROM public.customers c JOIN public.employees e ON e.id = c.owner_id
       WHERE c.id = l.customer_id;
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
      'unsubscribe_url', v_r ->> 'unsubscribe_url',
      'sender_name', v_sender ->> 'sender_name', 'sender_tag', v_sender ->> 'sender_tag', 'reply_to', v_sender ->> 'reply_to'));
  END LOOP;
  RETURN v_out;
END
$$;

-- ------------------------------------------------------------
-- Lead SLA default: NRW holidays (Lüdenscheid) and the decided values
-- ------------------------------------------------------------
INSERT INTO public.business_calendar (day, region, name) VALUES
  ('2028-01-01', 'DE', 'Neujahr'), ('2028-04-14', 'DE', 'Karfreitag'), ('2028-04-17', 'DE', 'Ostermontag'),
  ('2028-05-01', 'DE', 'Tag der Arbeit'), ('2028-05-25', 'DE', 'Christi Himmelfahrt'), ('2028-06-05', 'DE', 'Pfingstmontag'),
  ('2028-10-03', 'DE', 'Tag der Deutschen Einheit'), ('2028-12-25', 'DE', '1. Weihnachtstag'), ('2028-12-26', 'DE', '2. Weihnachtstag'),
  ('2026-06-04', 'DE-NW', 'Fronleichnam'), ('2026-11-01', 'DE-NW', 'Allerheiligen'),
  ('2027-05-27', 'DE-NW', 'Fronleichnam'), ('2027-11-01', 'DE-NW', 'Allerheiligen'),
  ('2028-06-15', 'DE-NW', 'Fronleichnam'), ('2028-11-01', 'DE-NW', 'Allerheiligen')
ON CONFLICT DO NOTHING;

UPDATE public.app_settings
   SET value = value || jsonb_build_object('first_contact_hours', 8, 'holiday_region', 'DE-NW', 'provisional', false),
       description = 'Lead-SLA in Geschäftsstunden (Standard: 8 Geschäftsstunden, Mo–Fr 09–17 Uhr, Feiertage NRW)'
 WHERE key = 'lead_sla' AND coalesce((value ->> 'provisional')::boolean, false);

-- Open, uncontacted leads get the deadline under the NRW calendar.
UPDATE public.leads SET sla_due_at = app_private.lead_sla_due(received_at)
 WHERE first_contact_at IS NULL AND closed_at IS NULL AND merged_into IS NULL;

-- ------------------------------------------------------------
-- Retention default
-- ------------------------------------------------------------
UPDATE public.app_settings
   SET value = jsonb_build_object('customer_years', 10, 'lead_years', 2),
       description = 'Aufbewahrung: 10 Jahre nach Ende der Kundenbeziehung (HGB/AO), 2 Jahre nach Abschluss eines Leads ohne Vertrag'
 WHERE key = 'retention' AND value ->> 'customer_years' IS NULL AND value ->> 'lead_years' IS NULL;
