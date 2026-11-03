-- ============================================================
-- Phase 6 review fixes (requirements1/phase-6-automation/verification/r1-p6-verification.md)
-- ============================================================
--   P6-01  no line breaks in template subjects: refused when saving, stripped when rendering
--   P6-02  only one active birthday campaign (approve / resume)
--   P6-03  named error keys instead of raw CHECK / unique / time-cast errors
--   P6-07  suppression reason validated; blocking an address again updates reason and note
--   P6-13  rpc_import_suppressions: CSV import of the suppression list (Gate E)
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.render_text(p_subject text, p_body text, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = ''
AS $function$
DECLARE
  v_subject text := p_subject;
  v_text    text := p_body;
  v_html    text := app_private.escape_html(p_body);
  v_field   text;
  v_value   text;
  v_missing text[] := '{}';
BEGIN
  FOR v_field IN SELECT DISTINCT m[1] FROM regexp_matches(p_subject || E'\n' || p_body, '\{\{\s*([a-z_]+)\s*\}\}', 'g') m LOOP
    v_value := nullif(btrim(coalesce(p_values ->> v_field, '')), '');
    IF v_value IS NULL THEN v_missing := array_append(v_missing, v_field); v_value := ''; END IF;
    v_subject := regexp_replace(v_subject, '\{\{\s*' || v_field || '\s*\}\}', regexp_replace(v_value, '[\r\n]+', ' ', 'g'), 'g');
    v_text    := regexp_replace(v_text, '\{\{\s*' || v_field || '\s*\}\}', replace(v_value, '\', '\\'), 'g');
    v_html    := regexp_replace(v_html, '\{\{\s*' || v_field || '\s*\}\}', replace(app_private.escape_html(v_value), '\', '\\'), 'g');
  END LOOP;
  -- An authored subject is one line (P6-01): no line break reaches a mail header.
  v_subject := btrim(regexp_replace(v_subject, '[\r\n]+', ' ', 'g'));
  v_html := '<p>' || replace(regexp_replace(v_html, '\r?\n\r?\n+', '</p><p>', 'g'), E'\n', '<br>') || '</p>';
  RETURN jsonb_build_object('subject', v_subject, 'text', v_text, 'html', v_html,
                            'missing', to_jsonb(ARRAY(SELECT unnest(v_missing) ORDER BY 1)));
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_save_email_template(p_id uuid, p_name text, p_purpose text, p_allowed_bases text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF length(btrim(coalesce(p_name, ''))) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'template_name_length' USING ERRCODE = '22023'; END IF;
  IF cardinality(p_allowed_bases) IS NULL OR cardinality(p_allowed_bases) = 0
     OR NOT p_allowed_bases <@ ARRAY['consent', 'contract', 'legitimate_interest', 'legal_obligation'] THEN
    RAISE EXCEPTION 'template_bases_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.email_templates WHERE lower(name) = lower(btrim(p_name)) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'template_name_taken' USING ERRCODE = '23505';
  END IF;
  PERFORM app_private.set_audit_context('E-Mail-Vorlage gepflegt');
  IF p_id IS NULL THEN
    INSERT INTO public.email_templates (name, purpose, allowed_bases, created_by)
    VALUES (btrim(p_name), p_purpose, p_allowed_bases, auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.email_templates SET name = btrim(p_name), purpose = p_purpose, allowed_bases = p_allowed_bases
     WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN v_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_save_template_draft(p_template_id uuid, p_subject text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_open public.email_template_versions%ROWTYPE;
  v_id   uuid;
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE id = p_template_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_subject ~ '[\r\n]' THEN RAISE EXCEPTION 'subject_line_break' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_subject, ''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'subject_length' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body, ''))) NOT BETWEEN 10 AND 10000 THEN RAISE EXCEPTION 'body_length' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.check_template_text(p_subject);
  PERFORM app_private.check_template_text(p_body);
  SELECT * INTO v_open FROM public.email_template_versions WHERE template_id = p_template_id AND status IN ('draft', 'submitted') FOR UPDATE;
  IF v_open.status = 'submitted' THEN RAISE EXCEPTION 'awaiting_review' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.set_audit_context('Vorlagenentwurf');
  IF v_open.id IS NULL THEN
    INSERT INTO public.email_template_versions (template_id, version, subject, body, created_by)
    VALUES (p_template_id, coalesce((SELECT max(version) FROM public.email_template_versions WHERE template_id = p_template_id), 0) + 1,
            btrim(p_subject), p_body, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    -- Editing a draft makes the editor its author (four-eyes stays meaningful).
    UPDATE public.email_template_versions SET subject = btrim(p_subject), body = p_body, created_by = auth.uid()
     WHERE id = v_open.id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_set_campaign_status(p_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    -- P6-02: one active birthday campaign, otherwise a customer gets two birthday mails.
    -- The lock serialises parallel approvals, so two can't both pass the check.
    IF k.kind = 'birthday' THEN PERFORM pg_advisory_xact_lock(hashtext('email_birthday_campaign')); END IF;
    IF k.kind = 'birthday' AND EXISTS (SELECT 1 FROM public.email_campaigns o
                                        WHERE o.kind = 'birthday' AND o.status = 'active' AND o.id <> k.id) THEN
      RAISE EXCEPTION 'birthday_campaign_active' USING ERRCODE = 'P0001';
    END IF;
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
    -- P6-02: one active birthday campaign, otherwise a customer gets two birthday mails.
    -- The lock serialises parallel approvals, so two can't both pass the check.
    IF k.kind = 'birthday' THEN PERFORM pg_advisory_xact_lock(hashtext('email_birthday_campaign')); END IF;
    IF k.kind = 'birthday' AND EXISTS (SELECT 1 FROM public.email_campaigns o
                                        WHERE o.kind = 'birthday' AND o.status = 'active' AND o.id <> k.id) THEN
      RAISE EXCEPTION 'birthday_campaign_active' USING ERRCODE = 'P0001';
    END IF;
    PERFORM app_private.set_audit_context('Kampagne fortgesetzt');
    UPDATE public.email_campaigns SET status = 'active' WHERE id = p_id;
  ELSIF p_action = 'cancel' AND k.status IN ('draft', 'submitted', 'active', 'paused') THEN
    PERFORM app_private.require_reason(p_reason);
    UPDATE public.email_campaigns SET status = 'cancelled' WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = 'P0001';
  END IF;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_set_suppression(p_email text, p_suppressed boolean, p_reason text DEFAULT 'manual'::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023'; END IF;
  IF p_suppressed THEN
    IF coalesce(p_reason, 'manual') NOT IN ('opt_out', 'bounce', 'complaint', 'invalid', 'manual') THEN
      RAISE EXCEPTION 'suppression_reason_invalid' USING ERRCODE = '22023';
    END IF;
    IF length(p_note) > 500 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
    PERFORM app_private.set_audit_context('Adresse gesperrt');
    -- Blocking again keeps the address blocked and records the newer reason (P6-07).
    INSERT INTO public.email_suppressions (email, reason, note, created_by)
    VALUES (v_email, coalesce(p_reason, 'manual'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, note = coalesce(EXCLUDED.note, public.email_suppressions.note);
  ELSE
    -- Lifting a block (e.g. after a corrected address) needs a reason.
    PERFORM app_private.require_reason(p_note);
    DELETE FROM public.email_suppressions WHERE email = v_email;
  END IF;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_set_email_window(p_start text, p_end text, p_days integer[], p_daily_limit integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  PERFORM app_private.assert_comms_officer();
  PERFORM app_private.require_reason(p_reason);
  -- Strict HH:MM first, so '25:00' is a German message and not a cast error (P6-03).
  IF p_start !~ '^([01]\d|2[0-3]):[0-5]\d$' OR p_end !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'invalid_time' USING ERRCODE = '22023';
  END IF;
  IF p_start::time >= p_end::time
     OR cardinality(p_days) = 0 OR NOT p_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7] OR p_daily_limit NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  UPDATE public.app_settings
     SET value = value || jsonb_build_object('window_start', p_start, 'window_end', p_end, 'window_days', to_jsonb(p_days), 'daily_limit', p_daily_limit),
         updated_at = now(), updated_by = auth.uid()
   WHERE key = 'email';
END
$function$

;

-- ------------------------------------------------------------
-- P6-13: import the existing opt-out / bounce list (Gate E)
-- ------------------------------------------------------------
-- p_rows: [{ "email": "...", "reason"?: "opt_out|bounce|complaint|invalid|manual" }], at most 10,000.
-- Returns counts and, per bad row, only its row number and an error code (no address).
CREATE OR REPLACE FUNCTION app_rpc.rpc_import_suppressions(p_rows jsonb, p_reason text DEFAULT 'manual', p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r        record;
  v_email  text;
  v_reason text;
  v_added  integer := 0;
  v_known  integer := 0;
  v_errors jsonb := '[]';
  v_seen   text[] := '{}';
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'import_empty' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 10000 THEN RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_reason, 'manual') NOT IN ('opt_out', 'bounce', 'complaint', 'invalid', 'manual') THEN
    RAISE EXCEPTION 'suppression_reason_invalid' USING ERRCODE = '22023';
  END IF;
  IF length(p_note) > 500 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.set_audit_context('Sperrliste importiert');

  FOR r IN SELECT value AS row, ordinality AS n FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
    v_email  := lower(btrim(coalesce(r.row ->> 'email', '')));
    v_reason := coalesce(nullif(lower(btrim(coalesce(r.row ->> 'reason', ''))), ''), p_reason, 'manual');
    IF v_email = '' THEN
      v_errors := v_errors || jsonb_build_object('row', r.n, 'code', 'email_missing');
    ELSIF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 320 THEN
      v_errors := v_errors || jsonb_build_object('row', r.n, 'code', 'invalid_email');
    ELSIF v_reason NOT IN ('opt_out', 'bounce', 'complaint', 'invalid', 'manual') THEN
      v_errors := v_errors || jsonb_build_object('row', r.n, 'code', 'suppression_reason_invalid');
    ELSIF v_email = ANY (v_seen) THEN
      v_errors := v_errors || jsonb_build_object('row', r.n, 'code', 'duplicate_in_file');
    ELSE
      v_seen := array_append(v_seen, v_email);
      INSERT INTO public.email_suppressions (email, reason, note, created_by)
      VALUES (v_email, v_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
      ON CONFLICT (email) DO NOTHING;
      IF FOUND THEN v_added := v_added + 1; ELSE v_known := v_known + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('added', v_added, 'already_blocked', v_known,
                            'failed', jsonb_array_length(v_errors), 'errors', v_errors);
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_import_suppressions(jsonb, text, text)'::regprocedure);
