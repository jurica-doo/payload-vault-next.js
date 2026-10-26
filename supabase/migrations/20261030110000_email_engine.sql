-- ============================================================
-- r1/p6/email-engine: campaigns, planning, send-time checks, logs (§10.2, §14.6)
-- ============================================================
-- app_settings.email      global kill switch (enabled=false by default),
--                         send window (Berlin time, weekdays), daily limit.
--                         Only admins can switch it on; admins or
--                         compliance can always switch it off.
-- email_campaigns         'birthday' (runs every day) or 'one_off' (holiday,
--                         year end) on a date. Four-eyes approval pins the
--                         template version that will be sent; later template
--                         changes do not affect an approved campaign.
-- email_suppressions      addresses that never receive automated mail
--                         (opt-out, bounce, complaint, invalid, manual).
-- email_send_log          one row per attempted send — including suppressed
--                         ones with their reason (§14.6). Idempotent: one row
--                         per (campaign, customer, occasion date).
-- Flow: plan_email_sends() (cron, idempotent) logs queued/suppressed rows →
-- the send-emails Edge Function calls rpc_claim_email_sends(), which checks
-- AGAIN at send time (kill switch, window, consent, basis, suppression, merge
-- fields, expiry) → provider → rpc_report_email_result(). Bounces arrive via
-- rpc_record_email_event() and feed the suppression list.
-- Provider: OD-11 (not chosen). Nothing is sent until Gate E.
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('email', jsonb_build_object(
          'enabled', false, 'window_start', '09:00', 'window_end', '18:00',
          'window_days', jsonb_build_array(1, 2, 3, 4, 5, 6, 7), 'daily_limit', 500),
        'E-Mail-Versand: globaler Schalter (aus bis Gate E), Versandfenster, Tageslimit (OD-11)')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 100),
  template_id         uuid NOT NULL REFERENCES public.email_templates (id),
  template_version_id uuid REFERENCES public.email_template_versions (id),
  kind                text NOT NULL CHECK (kind IN ('birthday', 'one_off')),
  send_on             date,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'active', 'paused', 'completed', 'cancelled')),
  created_by          uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_date_fits CHECK ((kind = 'one_off') = (send_on IS NOT NULL)),
  CONSTRAINT campaign_pinned CHECK (status IN ('draft', 'submitted', 'cancelled') OR template_version_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email      text PRIMARY KEY CHECK (email = lower(email)),
  reason     text NOT NULL CHECK (reason IN ('opt_out', 'bounce', 'complaint', 'invalid', 'manual')),
  note       text CHECK (note IS NULL OR length(note) <= 500),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                text NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'test')),
  campaign_id         uuid REFERENCES public.email_campaigns (id),
  customer_id         uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  template_version_id uuid NOT NULL REFERENCES public.email_template_versions (id),
  occasion_date       date NOT NULL,
  recipient           text,
  status              text NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'suppressed', 'expired')),
  suppression_reason  text,
  legal_basis         text,
  provider_message_id text UNIQUE,
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text CHECK (last_error IS NULL OR length(last_error) <= 200),
  claimed_at          timestamptz,
  sent_at             timestamptz,
  requested_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT send_log_live_has_campaign CHECK (mode = 'test' OR (campaign_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_send_log_once
  ON public.email_send_log (campaign_id, customer_id, occasion_date) WHERE mode = 'live';
CREATE INDEX IF NOT EXISTS idx_send_log_queue ON public.email_send_log (status, created_at) WHERE status IN ('queued', 'sending');
CREATE INDEX IF NOT EXISTS idx_send_log_customer ON public.email_send_log (customer_id, created_at DESC);

DROP TRIGGER IF EXISTS email_campaigns_touch ON public.email_campaigns;
CREATE TRIGGER email_campaigns_touch BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
DROP TRIGGER IF EXISTS email_send_log_touch ON public.email_send_log;
CREATE TRIGGER email_send_log_touch BEFORE UPDATE ON public.email_send_log FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.email_campaigns', 'id', '{updated_at}');
SELECT app_private.attach_audit('public.email_suppressions', 'email', '{}', '{email}');

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_campaigns_select ON public.email_campaigns;
CREATE POLICY email_campaigns_select ON public.email_campaigns FOR SELECT TO authenticated
  USING (app_private.has_role('admin') OR app_private.has_role('compliance'));
DROP POLICY IF EXISTS email_suppressions_select ON public.email_suppressions;
CREATE POLICY email_suppressions_select ON public.email_suppressions FOR SELECT TO authenticated
  USING (app_private.has_role('admin') OR app_private.has_role('compliance'));
-- Officers see the whole log; advisers see the history of customers they may see (§10.1).
DROP POLICY IF EXISTS email_send_log_select ON public.email_send_log;
CREATE POLICY email_send_log_select ON public.email_send_log FOR SELECT TO authenticated
  USING (app_private.has_role('admin') OR app_private.has_role('compliance')
         OR (customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id)));
REVOKE ALL ON public.email_campaigns, public.email_suppressions, public.email_send_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.email_campaigns, public.email_suppressions, public.email_send_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_campaigns, public.email_send_log TO service_role;
GRANT SELECT, INSERT, DELETE ON public.email_suppressions TO service_role;

-- Erasure removes the address from the log too.
CREATE OR REPLACE FUNCTION app_private.erase_send_log_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.email_send_log SET recipient = NULL WHERE customer_id = NEW.id;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS customers_erase_send_log ON public.customers;
CREATE TRIGGER customers_erase_send_log AFTER UPDATE OF erased_at ON public.customers
  FOR EACH ROW WHEN (OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL)
  EXECUTE FUNCTION app_private.erase_send_log_recipient();

-- ------------------------------------------------------------
-- Checks
-- ------------------------------------------------------------
-- Why a customer must not get this campaign's mail (NULL = may send).
CREATE OR REPLACE FUNCTION app_private.email_block_reason(p_customer_id uuid, p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k      public.email_campaigns%ROWTYPE;
  t      public.email_templates%ROWTYPE;
  v_may  jsonb;
  v_mail text;
  v_r    jsonb;
BEGIN
  SELECT * INTO k FROM public.email_campaigns WHERE id = p_campaign_id;
  SELECT * INTO t FROM public.email_templates WHERE id = k.template_id;
  v_may := app_private.may_contact(p_customer_id, app_private.consent_purpose_for(t.purpose));
  IF NOT (v_may ->> 'allowed')::boolean THEN RETURN jsonb_build_object('reason', v_may ->> 'reason'); END IF;
  IF NOT (v_may ->> 'legal_basis') = ANY (t.allowed_bases) THEN RETURN jsonb_build_object('reason', 'basis_not_allowed'); END IF;
  SELECT email INTO v_mail FROM public.customers WHERE id = p_customer_id;
  IF EXISTS (SELECT 1 FROM public.email_suppressions WHERE email = v_mail) THEN RETURN jsonb_build_object('reason', 'suppressed_address'); END IF;
  v_r := app_private.render_email(k.template_version_id, p_customer_id);
  IF jsonb_array_length(v_r -> 'missing') > 0 THEN RETURN jsonb_build_object('reason', 'missing_merge_field'); END IF;
  RETURN jsonb_build_object('reason', NULL, 'legal_basis', v_may ->> 'legal_basis', 'recipient', v_mail);
END
$$;

-- Is "now" inside the configured send window (Berlin time)?
CREATE OR REPLACE FUNCTION app_private.in_send_window(p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT extract(isodow FROM (p_at AT TIME ZONE 'Europe/Berlin'))::integer IN (SELECT jsonb_array_elements_text(s.value -> 'window_days')::integer)
     AND (p_at AT TIME ZONE 'Europe/Berlin')::time >= (s.value ->> 'window_start')::time
     AND (p_at AT TIME ZONE 'Europe/Berlin')::time < (s.value ->> 'window_end')::time
    FROM public.app_settings s WHERE s.key = 'email'
$$;

-- ------------------------------------------------------------
-- Planner (idempotent; cron)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.plan_email_sends(p_today date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today   date := coalesce(p_today, app_private.business_today());
  v_leap    boolean := extract(day FROM (date_trunc('year', v_today) + interval '1 month 28 days'))::integer = 29;
  k         record;
  c         record;
  v_block   jsonb;
  v_queued  integer := 0;
  v_supp    integer := 0;
BEGIN
  IF NOT coalesce((SELECT (value ->> 'enabled')::boolean FROM public.app_settings WHERE key = 'email'), false) THEN
    RETURN jsonb_build_object('paused', true);
  END IF;
  PERFORM app_private.set_audit_context('E-Mail-Planung');
  FOR k IN SELECT * FROM public.email_campaigns WHERE status = 'active'
             AND (kind = 'birthday' OR send_on = v_today) LOOP
    FOR c IN SELECT cu.id FROM public.customers cu
              WHERE cu.erased_at IS NULL AND cu.archived_at IS NULL
                AND (k.kind = 'one_off' OR (
                     extract(month FROM cu.date_of_birth) = extract(month FROM v_today)
                     AND (extract(day FROM cu.date_of_birth) = extract(day FROM v_today)
                          -- 29 Feb birthdays are celebrated on 28 Feb in common years
                          OR (NOT v_leap AND extract(month FROM v_today) = 2 AND extract(day FROM v_today) = 28
                              AND extract(month FROM cu.date_of_birth) = 2 AND extract(day FROM cu.date_of_birth) = 29))))
                AND NOT EXISTS (SELECT 1 FROM public.email_send_log l
                                 WHERE l.mode = 'live' AND l.campaign_id = k.id AND l.customer_id = cu.id AND l.occasion_date = v_today) LOOP
      v_block := app_private.email_block_reason(c.id, k.id);
      INSERT INTO public.email_send_log (campaign_id, customer_id, template_version_id, occasion_date, recipient, status, suppression_reason, legal_basis)
      VALUES (k.id, c.id, k.template_version_id, v_today,
              CASE WHEN v_block ->> 'reason' IS NULL THEN v_block ->> 'recipient' END,
              CASE WHEN v_block ->> 'reason' IS NULL THEN 'queued' ELSE 'suppressed' END,
              v_block ->> 'reason', v_block ->> 'legal_basis')
      ON CONFLICT DO NOTHING;
      IF v_block ->> 'reason' IS NULL THEN v_queued := v_queued + 1; ELSE v_supp := v_supp + 1; END IF;
    END LOOP;
    IF k.kind = 'one_off' THEN
      UPDATE public.email_campaigns SET status = 'completed' WHERE id = k.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('queued', v_queued, 'suppressed', v_supp);
END
$$;

-- ------------------------------------------------------------
-- Delivery API (service role: the send-emails Edge Function)
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
      v_r := app_private.render_text(
        (SELECT subject FROM public.email_template_versions WHERE id = l.template_version_id),
        (SELECT body FROM public.email_template_versions WHERE id = l.template_version_id),
        app_private.merge_values(NULL));
      v_r := jsonb_set(v_r, '{subject}', to_jsonb('[TEST] ' || (v_r ->> 'subject')));
      UPDATE public.email_send_log SET status = 'sending', claimed_at = now(), attempts = attempts + 1 WHERE id = l.id;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', l.id, 'idempotency_key', l.id, 'to', (SELECT recipient FROM public.email_send_log WHERE id = l.id),
      'subject', v_r ->> 'subject', 'text', v_r ->> 'text', 'html', v_r ->> 'html'));
  END LOOP;
  RETURN v_out;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_report_email_result(p_id uuid, p_ok boolean, p_provider_message_id text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.email_send_log
     SET status = CASE WHEN p_ok THEN 'sent' WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
         sent_at = CASE WHEN p_ok THEN now() END,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         last_error = left(p_error, 200)
   WHERE id = p_id AND status = 'sending';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
END
$$;

-- Provider webhooks (delivered / bounced / complaint).
CREATE OR REPLACE FUNCTION public.rpc_record_email_event(p_provider_message_id text, p_event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l public.email_send_log%ROWTYPE;
BEGIN
  IF p_event NOT IN ('delivered', 'bounced', 'complaint') THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  SELECT * INTO l FROM public.email_send_log WHERE provider_message_id = p_provider_message_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.email_send_log SET status = CASE WHEN p_event = 'delivered' THEN 'delivered' ELSE 'bounced' END,
         last_error = CASE WHEN p_event = 'delivered' THEN last_error ELSE p_event END
   WHERE id = l.id;
  IF p_event <> 'delivered' AND l.recipient IS NOT NULL AND l.mode = 'live' THEN
    PERFORM app_private.set_audit_context('Zustellproblem: ' || p_event);
    INSERT INTO public.email_suppressions (email, reason, note)
    VALUES (lower(l.recipient), CASE WHEN p_event = 'bounced' THEN 'bounce' ELSE 'complaint' END, 'automatisch vom Anbieter gemeldet')
    ON CONFLICT (email) DO NOTHING;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- Officer RPCs (admin/compliance with MFA)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_set_email_enabled(p_enabled boolean, p_reason text)
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
  UPDATE public.app_settings SET value = jsonb_set(value, '{enabled}', to_jsonb(p_enabled)), updated_at = now(), updated_by = auth.uid()
   WHERE key = 'email';
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_email_window(p_start text, p_end text, p_days integer[], p_daily_limit integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_comms_officer();
  PERFORM app_private.require_reason(p_reason);
  IF p_start !~ '^\d{2}:\d{2}$' OR p_end !~ '^\d{2}:\d{2}$' OR p_start::time >= p_end::time
     OR cardinality(p_days) = 0 OR NOT p_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7] OR p_daily_limit NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  UPDATE public.app_settings
     SET value = value || jsonb_build_object('window_start', p_start, 'window_end', p_end, 'window_days', to_jsonb(p_days), 'daily_limit', p_daily_limit),
         updated_at = now(), updated_by = auth.uid()
   WHERE key = 'email';
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_email_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('compliance')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT value FROM public.app_settings WHERE key = 'email')
    || jsonb_build_object('in_window', app_private.in_send_window(),
         'last_7_days', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM (
            SELECT status, count(*) AS n FROM public.email_send_log WHERE mode = 'live' AND created_at > now() - interval '7 days' GROUP BY status) x));
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_save_campaign(p_id uuid, p_name text, p_template_id uuid, p_kind text, p_send_on date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id      uuid;
  v_purpose text := (SELECT purpose FROM public.email_templates WHERE id = p_template_id AND archived_at IS NULL);
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF v_purpose IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_kind = 'birthday' AND v_purpose <> 'birthday' THEN RAISE EXCEPTION 'template_purpose_mismatch' USING ERRCODE = 'P0001'; END IF;
  IF p_kind = 'one_off' AND (p_send_on IS NULL OR p_send_on < app_private.business_today()) THEN
    RAISE EXCEPTION 'date_in_past' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.set_audit_context('Kampagne gepflegt');
  IF p_id IS NULL THEN
    INSERT INTO public.email_campaigns (name, template_id, kind, send_on, created_by)
    VALUES (btrim(p_name), p_template_id, p_kind, CASE WHEN p_kind = 'one_off' THEN p_send_on END, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.email_campaigns
       SET name = btrim(p_name), template_id = p_template_id, kind = p_kind, send_on = CASE WHEN p_kind = 'one_off' THEN p_send_on END,
           created_by = auth.uid()
     WHERE id = p_id AND status = 'draft'
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN v_id;
END
$$;

-- submit / approve (four-eyes, pins the active template version) / pause / resume / cancel
CREATE OR REPLACE FUNCTION public.rpc_set_campaign_status(p_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k public.email_campaigns%ROWTYPE;
  v_version uuid;
BEGIN
  PERFORM app_private.assert_comms_officer();
  SELECT * INTO k FROM public.email_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_action = 'submit' AND k.status = 'draft' THEN
    UPDATE public.email_campaigns SET status = 'submitted' WHERE id = p_id;
  ELSIF p_action = 'approve' AND k.status = 'submitted' THEN
    IF k.created_by = auth.uid() THEN RAISE EXCEPTION 'cannot_approve_own' USING ERRCODE = '42501'; END IF;
    SELECT active_version_id INTO v_version FROM public.email_templates WHERE id = k.template_id;
    IF v_version IS NULL THEN RAISE EXCEPTION 'template_not_approved' USING ERRCODE = 'P0001'; END IF;
    PERFORM app_private.set_audit_context('Kampagne freigegeben');
    UPDATE public.email_campaigns SET status = 'active', template_version_id = v_version, approved_by = auth.uid(), approved_at = now()
     WHERE id = p_id;
  ELSIF p_action = 'reject' AND k.status = 'submitted' THEN
    PERFORM app_private.require_reason(p_reason);
    UPDATE public.email_campaigns SET status = 'draft' WHERE id = p_id;
  ELSIF p_action = 'pause' AND k.status = 'active' THEN
    PERFORM app_private.set_audit_context('Kampagne pausiert');
    UPDATE public.email_campaigns SET status = 'paused' WHERE id = p_id;
  ELSIF p_action = 'resume' AND k.status = 'paused' THEN
    PERFORM app_private.set_audit_context('Kampagne fortgesetzt');
    UPDATE public.email_campaigns SET status = 'active' WHERE id = p_id;
  ELSIF p_action = 'cancel' AND k.status IN ('draft', 'submitted', 'active', 'paused') THEN
    PERFORM app_private.require_reason(p_reason);
    UPDATE public.email_campaigns SET status = 'cancelled' WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = 'P0001';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_suppression(p_email text, p_suppressed boolean, p_reason text DEFAULT 'manual', p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023'; END IF;
  IF p_suppressed THEN
    PERFORM app_private.set_audit_context('Adresse gesperrt');
    INSERT INTO public.email_suppressions (email, reason, note, created_by)
    VALUES (v_email, coalesce(p_reason, 'manual'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    ON CONFLICT (email) DO NOTHING;
  ELSE
    -- Lifting a block (e.g. after a corrected address) needs a reason.
    PERFORM app_private.require_reason(p_note);
    DELETE FROM public.email_suppressions WHERE email = v_email;
  END IF;
END
$$;

-- Test send to the requesting officer only (§10.2 "test mode"); works while the switch is off.
CREATE OR REPLACE FUNCTION public.rpc_send_test_email(p_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mail text := (SELECT lower(email) FROM auth.users WHERE id = auth.uid());
  v_id   uuid;
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF NOT EXISTS (SELECT 1 FROM public.email_template_versions WHERE id = p_version_id) THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.consume_rate_limit('email_test:' || auth.uid()::text, 10, 3600) THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.email_send_log (mode, template_version_id, occasion_date, recipient, status, requested_by)
  VALUES ('test', p_version_id, app_private.business_today(), v_mail, 'queued', auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Scheduling: the planner hourly (idempotent). The send-emails Edge Function
-- is triggered separately (Supabase scheduled function / pg_net), see notes.
CREATE OR REPLACE FUNCTION app_private.schedule_email_jobs()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN RETURN 'pg_cron not enabled'; END IF;
  EXECUTE $q$SELECT cron.schedule('r1-email-planner', '5 * * * *', 'SELECT app_private.plan_email_sends()')$q$;
  RETURN 'scheduled';
EXCEPTION WHEN OTHERS THEN
  RETURN 'not scheduled: ' || SQLERRM;
END
$$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_claim_email_sends(integer), public.rpc_report_email_result(uuid, boolean, text, text), public.rpc_record_email_event(text, text),
  public.rpc_set_email_enabled(boolean, text), public.rpc_set_email_window(text, text, integer[], integer, text), public.rpc_email_status(),
  public.rpc_save_campaign(uuid, text, uuid, text, date), public.rpc_set_campaign_status(uuid, text, text),
  public.rpc_set_suppression(text, boolean, text, text), public.rpc_send_test_email(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.rpc_set_email_enabled(boolean, text), public.rpc_set_email_window(text, text, integer[], integer, text), public.rpc_email_status(),
  public.rpc_save_campaign(uuid, text, uuid, text, date), public.rpc_set_campaign_status(uuid, text, text),
  public.rpc_set_suppression(text, boolean, text, text), public.rpc_send_test_email(uuid)
TO authenticated;
-- Delivery and provider webhooks: only the Edge Functions (service role).
GRANT EXECUTE ON FUNCTION
  public.rpc_claim_email_sends(integer), public.rpc_report_email_result(uuid, boolean, text, text), public.rpc_record_email_event(text, text)
TO service_role;
