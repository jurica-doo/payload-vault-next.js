-- ============================================================
-- Go-live defaults (2026-11-21)
-- ============================================================
--  * Sender details: company and address from the Profina contract are
--    prefilled; register, management, contact e-mail and app address stay
--    empty, so sending remains blocked until an admin completes them.
--  * Three German template drafts using {{briefanrede}}: birthday, Christmas
--    / new year, annual review. They are drafts: an admin submits them, a
--    second person approves (four-eyes) before any campaign can use them.
--  * rpc_reset_employee_mfa: an admin (with 2FA) removes a person's lost
--    authenticator and ends their sessions; the person sets up a new one at
--    /profil/sicherheit. Not for oneself (another admin must do it). Logged.
-- ============================================================

-- ------------------------------------------------------------
-- Sender details: what is known
-- ------------------------------------------------------------
UPDATE public.app_settings
   SET value = jsonb_build_object('company', 'Profina Deutschland GmbH', 'address', 'Castroper Straße 270–280, 44791 Bochum')
 WHERE key = 'email_sender' AND value = '{}'::jsonb;

-- ------------------------------------------------------------
-- Template drafts (only if no template of that name exists)
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_t uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Geburtstagsgruß', 'birthday', 'Herzlichen Glückwunsch zum Geburtstag, {{rufname}}!',
     E'{{briefanrede}},\n\nzu Ihrem Geburtstag gratuliere ich Ihnen ganz herzlich und wünsche Ihnen Gesundheit, Glück und ein wunderbares neues Lebensjahr.\n\nWenn ich Sie bei Ihren Versicherungen und Ihrer Vorsorge unterstützen kann, bin ich gern für Sie da.\n\nHerzliche Grüße\n{{berater_name}}'),
    ('Weihnachts- und Neujahrsgruß', 'year_end', 'Frohe Weihnachten und ein gutes neues Jahr',
     E'{{briefanrede}},\n\nein ereignisreiches Jahr geht zu Ende. Ich danke Ihnen für Ihr Vertrauen und die gute Zusammenarbeit.\n\nIch wünsche Ihnen und Ihren Liebsten frohe Weihnachten, erholsame Feiertage und ein gesundes, erfolgreiches Jahr {{jahr}}.\n\nHerzliche Grüße\n{{berater_name}}'),
    ('Einladung zum Jahresgespräch', 'service', 'Ihr persönliches Jahresgespräch',
     E'{{briefanrede_formell}},\n\neinmal im Jahr lohnt sich ein kurzer Blick auf Ihre Versicherungen und Ihre Vorsorge: Passt alles noch zu Ihrer Lebenssituation?\n\nGern vereinbare ich dafür einen Termin mit Ihnen – persönlich, telefonisch oder per Video. Antworten Sie einfach auf diese E-Mail oder rufen Sie mich an: {{berater_telefon}}.\n\nMit freundlichen Grüßen\n{{berater_name}}')
  ) AS t(name, purpose, subject, body)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.email_templates WHERE name = r.name);
    INSERT INTO public.email_templates (name, purpose, allowed_bases)
    VALUES (r.name, r.purpose, CASE WHEN r.purpose = 'service' THEN '{consent,contract}'::text[] ELSE '{consent}'::text[] END)
    RETURNING id INTO v_t;
    INSERT INTO public.email_template_versions (template_id, version, subject, body) VALUES (v_t, 1, r.subject, r.body);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- Reset a lost authenticator
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_reset_employee_mfa(p_employee_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user    uuid;
  v_reason  text;
  v_factors integer;
BEGIN
  PERFORM app_private.assert_admin();
  v_reason := app_private.require_reason(p_reason);
  SELECT user_id INTO v_user FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'no_account' USING ERRCODE = 'P0001'; END IF;
  -- Four eyes: nobody removes their own second factor.
  IF v_user = auth.uid() THEN RAISE EXCEPTION 'cannot_reset_own_mfa' USING ERRCODE = '42501'; END IF;

  DELETE FROM auth.mfa_factors WHERE user_id = v_user;
  GET DIAGNOSTICS v_factors = ROW_COUNT;
  -- End every session, so nothing keeps working with the old confirmation.
  DELETE FROM auth.sessions WHERE user_id = v_user;

  PERFORM app_private.log_event('mfa.reset', 'public.employees', p_employee_id::text,
    jsonb_build_object('reason', v_reason, 'factors_removed', v_factors));
  PERFORM app_private.notify(p_employee_id, 'manual', 'Ihre Zwei-Faktor-Anmeldung wurde zurückgesetzt',
    'Bitte richten Sie sie unter „Sicherheit“ neu ein.', '/profil/sicherheit');
  RETURN v_factors;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_reset_employee_mfa(uuid, text)'::regprocedure);
