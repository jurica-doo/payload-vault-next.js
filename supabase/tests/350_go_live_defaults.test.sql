-- ============================================================
-- Go-live defaults (migration 20261101200000): sender prefill, German
-- template drafts, reset of a lost authenticator
-- ============================================================
BEGIN;
SELECT plan(13);

-- ---------- sender details ----------
SELECT is((SELECT value ->> 'company' FROM public.app_settings WHERE key = 'email_sender'), 'Profina Deutschland GmbH', 'company prefilled');
SELECT ok(NOT app_private.email_sender_complete((SELECT value FROM public.app_settings WHERE key = 'email_sender')),
  'still incomplete: sending stays blocked until register, management, contact and app address are entered');

-- ---------- template drafts ----------
SELECT is((SELECT count(*) FROM public.email_templates t JOIN public.email_template_versions v ON v.template_id = t.id
            WHERE t.name IN ('Geburtstagsgruß', 'Weihnachts- und Neujahrsgruß', 'Einladung zum Jahresgespräch') AND v.status = 'draft')::int, 3,
  'three German drafts, none approved yet (four-eyes)');
SELECT ok((SELECT bool_and(v.body LIKE '{{briefanrede%') FROM public.email_template_versions v JOIN public.email_templates t ON t.id = v.template_id
            WHERE t.name IN ('Geburtstagsgruß', 'Weihnachts- und Neujahrsgruß', 'Einladung zum Jahresgespräch')), 'drafts open with the salutation');
SELECT lives_ok($$SELECT app_private.check_template_text(v.subject || ' ' || v.body) FROM public.email_template_versions v
            JOIN public.email_templates t ON t.id = v.template_id
           WHERE t.name IN ('Geburtstagsgruß', 'Weihnachts- und Neujahrsgruß', 'Einladung zum Jahresgespräch')$$, 'drafts use only known placeholders');

-- ---------- reset a lost authenticator ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('admin2@test.local', true) AS admin2 \gset
SELECT tests.grant_role(:'admin2', 'admin');
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'admin') AS e_admin \gset
INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
VALUES (gen_random_uuid(), :'fa', 'totp', 'verified', now(), now());

SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_reset_employee_mfa(%L, 'Handy verloren, neu einrichten')$$, :'e_fa'), '42501', NULL,
  'advisers cannot reset anyone');
SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_reset_employee_mfa(%L, 'Handy verloren, neu einrichten')$$, :'e_fa'), '42501', 'mfa_required',
  'admins need 2FA themselves');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_reset_employee_mfa(%L, 'kurz')$$, :'e_fa'), '22023', 'reason_required', 'needs a reason');
SELECT throws_ok(format($$SELECT public.rpc_reset_employee_mfa(%L, 'Eigenes Handy verloren')$$, :'e_admin'), '42501', 'cannot_reset_own_mfa',
  'nobody resets their own second factor');
SELECT is(public.rpc_reset_employee_mfa(:'e_fa', 'Handy verloren, neu einrichten'), 1, 'one factor removed');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM auth.mfa_factors WHERE user_id = :'fa')::int, 0, 'the lost authenticator is gone');
SELECT is((SELECT count(*) FROM audit.events WHERE action = 'mfa.reset' AND entity_id = :'e_fa')::int, 1, 'the reset is logged');
SELECT is((SELECT count(*) FROM public.notifications WHERE recipient_id = :'e_fa' AND title LIKE 'Ihre Zwei-Faktor-Anmeldung%')::int, 1,
  'the person is told to set up a new one');

SELECT * FROM finish();
ROLLBACK;
