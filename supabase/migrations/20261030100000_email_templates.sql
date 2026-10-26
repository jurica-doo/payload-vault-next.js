-- ============================================================
-- r1/p6/email-templates: versioned templates with four-eyes approval (§10.2, §12.3)
-- ============================================================
-- email_templates          purpose (birthday / holiday / year_end / service /
--                          marketing) → the consent purpose it needs, and the
--                          legal bases this template accepts (default:
--                          consent only; Profina's privacy contact decides).
-- email_template_versions  draft → submitted → approved | rejected; approving
--                          retires the previous version. Approved and retired
--                          versions are immutable. The approver must not be
--                          the author (four-eyes), both admin/compliance + MFA.
-- Merge fields are a whitelist ({{vorname}}, {{nachname}}, {{rufname}},
-- {{name}}, {{berater_name}}, {{berater_vorname}}, {{berater_email}},
-- {{berater_telefon}}, {{jahr}}). Templates are plain text; HTML is produced
-- by escaping, never authored, so no markup or scripts can be injected.
-- Values are stripped of line breaks in the subject (header injection).
-- app_private.render_email mirrors src/domain/emailTemplate.ts (GC-MERGE-*).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 3 AND 100),
  purpose           text NOT NULL CHECK (purpose IN ('birthday', 'holiday', 'year_end', 'service', 'marketing')),
  allowed_bases     text[] NOT NULL DEFAULT '{consent}'
                      CHECK (cardinality(allowed_bases) > 0 AND allowed_bases <@ ARRAY['consent', 'contract', 'legitimate_interest', 'legal_obligation']),
  active_version_id uuid,
  archived_at       timestamptz,
  created_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_template_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.email_templates (id) ON DELETE RESTRICT,
  version       integer NOT NULL,
  subject       text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 200),
  body          text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 10000),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'retired')),
  created_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  submitted_at  timestamptz,
  decided_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_one_open_version
  ON public.email_template_versions (template_id) WHERE status IN ('draft', 'submitted');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_active_version_fk') THEN
    ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_active_version_fk
      FOREIGN KEY (active_version_id) REFERENCES public.email_template_versions (id);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS email_templates_touch ON public.email_templates;
CREATE TRIGGER email_templates_touch BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
DROP TRIGGER IF EXISTS email_template_versions_touch ON public.email_template_versions;
CREATE TRIGGER email_template_versions_touch BEFORE UPDATE ON public.email_template_versions FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.email_templates', 'id', '{updated_at}');
SELECT app_private.attach_audit('public.email_template_versions', 'id', '{updated_at}');

-- Approved/retired content never changes; only approved → retired is allowed.
CREATE OR REPLACE FUNCTION app_private.guard_template_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'retired') THEN RAISE EXCEPTION 'template_version_immutable' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('approved', 'retired') AND NOT (
       OLD.status = 'approved' AND NEW.status = 'retired'
       AND NEW.subject = OLD.subject AND NEW.body = OLD.body AND NEW.decided_by IS NOT DISTINCT FROM OLD.decided_by) THEN
    RAISE EXCEPTION 'template_version_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS email_template_versions_guard ON public.email_template_versions;
CREATE TRIGGER email_template_versions_guard BEFORE UPDATE OR DELETE ON public.email_template_versions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_template_version();

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_templates_select ON public.email_templates;
CREATE POLICY email_templates_select ON public.email_templates FOR SELECT TO authenticated
  USING (app_private.has_role('admin') OR app_private.has_role('compliance'));
DROP POLICY IF EXISTS email_template_versions_select ON public.email_template_versions;
CREATE POLICY email_template_versions_select ON public.email_template_versions FOR SELECT TO authenticated
  USING (app_private.has_role('admin') OR app_private.has_role('compliance'));
REVOKE ALL ON public.email_templates, public.email_template_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.email_templates, public.email_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_templates, public.email_template_versions TO service_role;

-- ------------------------------------------------------------
-- Merge fields and rendering
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.merge_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY['vorname', 'nachname', 'rufname', 'name', 'berater_vorname', 'berater_name', 'berater_email', 'berater_telefon', 'jahr'] $$;

CREATE OR REPLACE FUNCTION app_private.consent_purpose_for(p_purpose text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_purpose WHEN 'birthday' THEN 'birthday_email' WHEN 'holiday' THEN 'holiday_email'
                        WHEN 'year_end' THEN 'holiday_email' WHEN 'service' THEN 'contact_email' ELSE 'marketing_email' END
$$;

-- Rejects unknown or malformed placeholders.
CREATE OR REPLACE FUNCTION app_private.check_template_text(p_text text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_field text;
BEGIN
  -- Every "{{" must open a well-formed placeholder.
  IF (length(p_text) - length(replace(p_text, '{{', ''))) / 2
     <> (SELECT count(*) FROM regexp_matches(p_text, '\{\{\s*[a-z_]+\s*\}\}', 'g')) THEN
    RAISE EXCEPTION 'invalid_template' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT m[1] FROM regexp_matches(p_text, '\{\{\s*([a-z_]+)\s*\}\}', 'g') m LOOP
    IF NOT v_field = ANY (app_private.merge_fields()) THEN
      RAISE EXCEPTION 'unknown_merge_field' USING ERRCODE = '22023', DETAIL = v_field;
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION app_private.escape_html(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(replace(replace(replace(replace(p_text, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

-- Pure renderer: p_values maps merge field → value (missing/empty = missing).
CREATE OR REPLACE FUNCTION app_private.render_text(p_subject text, p_body text, p_values jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
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
  v_html := '<p>' || replace(regexp_replace(v_html, '\r?\n\r?\n+', '</p><p>', 'g'), E'\n', '<br>') || '</p>';
  RETURN jsonb_build_object('subject', v_subject, 'text', v_text, 'html', v_html,
                            'missing', to_jsonb(ARRAY(SELECT unnest(v_missing) ORDER BY 1)));
END
$$;

-- Merge values for a customer (or sample values for previews).
CREATE OR REPLACE FUNCTION app_private.merge_values(p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN p_customer_id IS NULL THEN jsonb_build_object(
           'vorname', 'Erika', 'nachname', 'Mustermann', 'rufname', 'Erika', 'name', 'Erika Mustermann',
           'berater_vorname', 'Max', 'berater_name', 'Max Berater', 'berater_email', 'max.berater@profina.example',
           'berater_telefon', '+49 170 0000000', 'jahr', extract(year FROM app_private.business_today())::text)
         ELSE (SELECT jsonb_build_object(
           'vorname', c.first_name, 'nachname', c.last_name,
           'rufname', coalesce(c.preferred_name, c.first_name),
           'name', nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
           'berater_vorname', e.first_name, 'berater_name', e.first_name || ' ' || e.last_name,
           'berater_email', e.email, 'berater_telefon', e.phone,
           'jahr', extract(year FROM app_private.business_today())::text)
           FROM public.customers c JOIN public.employees e ON e.id = c.owner_id WHERE c.id = p_customer_id) END
$$;

CREATE OR REPLACE FUNCTION app_private.render_email(p_version_id uuid, p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.render_text(v.subject, v.body, app_private.merge_values(p_customer_id))
    FROM public.email_template_versions v WHERE v.id = p_version_id
$$;

-- ------------------------------------------------------------
-- RPCs (admin/compliance with MFA)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.assert_comms_officer()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('compliance')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_save_email_template(p_id uuid, p_name text, p_purpose text, p_allowed_bases text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM app_private.assert_comms_officer();
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
$$;

-- Creates the draft (next version) or updates the open draft.
CREATE OR REPLACE FUNCTION public.rpc_save_template_draft(p_template_id uuid, p_subject text, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open public.email_template_versions%ROWTYPE;
  v_id   uuid;
BEGIN
  PERFORM app_private.assert_comms_officer();
  IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE id = p_template_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.rpc_submit_template_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_comms_officer();
  UPDATE public.email_template_versions SET status = 'submitted', submitted_at = now()
   WHERE id = p_version_id AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_decide_template_version(p_version_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.email_template_versions%ROWTYPE;
BEGIN
  PERFORM app_private.assert_comms_officer();
  SELECT * INTO v FROM public.email_template_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  IF v.created_by = auth.uid() THEN RAISE EXCEPTION 'cannot_approve_own' USING ERRCODE = '42501'; END IF;
  IF NOT p_approve THEN PERFORM app_private.require_reason(p_note); END IF;
  PERFORM app_private.set_audit_context(CASE WHEN p_approve THEN 'Vorlage freigegeben' ELSE 'Vorlage abgelehnt' END);
  IF p_approve THEN
    UPDATE public.email_template_versions SET status = 'retired' WHERE template_id = v.template_id AND status = 'approved';
  END IF;
  UPDATE public.email_template_versions
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = v.id;
  IF p_approve THEN
    UPDATE public.email_templates SET active_version_id = v.id WHERE id = v.template_id;
  END IF;
END
$$;

-- Preview with sample data, or with a real customer the caller may see.
CREATE OR REPLACE FUNCTION public.rpc_preview_template(p_version_id uuid, p_customer_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('admin') OR app_private.has_role('compliance')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.erased_at IS NULL AND app_private.can_see_customer(c.owner_id)) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_template_versions WHERE id = p_version_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN app_private.render_email(p_version_id, p_customer_id);
END
$$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_save_email_template(uuid, text, text, text[]), public.rpc_save_template_draft(uuid, text, text),
  public.rpc_submit_template_version(uuid), public.rpc_decide_template_version(uuid, boolean, text), public.rpc_preview_template(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_save_email_template(uuid, text, text, text[]), public.rpc_save_template_draft(uuid, text, text),
  public.rpc_submit_template_version(uuid), public.rpc_decide_template_version(uuid, boolean, text), public.rpc_preview_template(uuid, uuid)
TO authenticated;
