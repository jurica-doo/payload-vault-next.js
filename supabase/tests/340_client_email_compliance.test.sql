-- ============================================================
-- Client e-mail: salutation, footer with sender details, unsubscribe
-- (migration 20261101180000)
-- ============================================================
BEGIN;
SELECT plan(29);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('fa@test.local', true) AS fa \gset

-- ---------- salutation lines ----------
SELECT is(app_private.salutation_line('frau', 'Sabine', 'Kowalski', false), 'Liebe Frau Kowalski', 'personal, Frau');
SELECT is(app_private.salutation_line('herr', 'Jan', 'Weber', true), 'Sehr geehrter Herr Weber', 'formal, Herr');
SELECT is(app_private.salutation_line('divers', 'Kim', 'Lang', false), 'Guten Tag Kim Lang', 'divers → neutral');
SELECT is(app_private.salutation_line(NULL, 'Kim', 'Lang', true), 'Guten Tag Kim Lang', 'unknown → neutral');
SELECT is(app_private.salutation_line('frau', 'Kim', NULL, false), 'Guten Tag Kim', 'no last name → neutral, never "Liebe Frau "');

-- ---------- customers with salutation ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Sabine', 'last_name', 'Kowalski', 'email', 'sabine@example.org',
  'salutation', 'frau')) AS c \gset
SELECT is((SELECT salutation FROM public.customers WHERE id = :'c'), 'frau', 'salutation saved on create');
SELECT public.rpc_update_customer(:'c', '{"salutation":"divers"}');
SELECT is((SELECT salutation FROM public.customers WHERE id = :'c'), 'divers', 'salutation saved on update');
SELECT public.rpc_update_customer(:'c', '{"salutation":"frau"}');
SELECT throws_ok(format($$SELECT public.rpc_update_customer(%L, '{"salutation":"fräulein"}')$$, :'c'), '22023', 'invalid_input',
  'unknown salutation refused');
SELECT public.rpc_record_consent(:'c', 'birthday_email', 'granted', 'consent', 'form', 'Formular Beratung');
SELECT tests.clear_authentication();
SELECT is(app_private.merge_values(:'c') ->> 'briefanrede', 'Liebe Frau Kowalski', '{{briefanrede}} for the customer');
SELECT is(app_private.merge_values(:'c') ->> 'briefanrede_formell', 'Sehr geehrte Frau Kowalski', '{{briefanrede_formell}}');
SELECT ok('briefanrede' = ANY (app_private.merge_fields()), 'templates may use {{briefanrede}}');

-- ---------- sender details ----------
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT throws_ok($$SELECT public.rpc_set_email_sender('{"company":"X GmbH"}', 'Absenderangaben laut Impressum')$$, '42501', NULL,
  'only admins set the sender details');
SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok($$SELECT public.rpc_set_email_sender('{"company":"X GmbH"}', 'Absenderangaben laut Impressum')$$, '42501', 'mfa_required',
  'with 2FA');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok($$SELECT public.rpc_set_email_enabled(true, 'Gate E bestanden und geprüft')$$, 'P0001', 'sender_details_missing',
  'sending cannot start without sender details');
SELECT throws_ok($$SELECT public.rpc_set_email_sender('{"contact_email":"kein-at"}', 'Absenderangaben laut Impressum')$$, '22023', 'invalid_email',
  'contact e-mail checked');
SELECT throws_ok($$SELECT public.rpc_set_email_sender('{"app_url":"javascript:alert(1)"}', 'Absenderangaben laut Impressum')$$, '22023', 'invalid_url',
  'app address must be http(s)');
SELECT throws_ok($$SELECT public.rpc_set_email_sender('{"foo":"bar"}', 'Absenderangaben laut Impressum')$$, '22023', 'invalid_input',
  'unknown keys refused');
SELECT public.rpc_set_email_sender('{"company":"Profina Deutschland GmbH","address":"Castroper Straße 270–280, 44791 Bochum","register":"Amtsgericht Bochum HRB 0000","management":"Erika Muster","contact_email":"kontakt@profina.example","app_url":"https://app.profina.example/"}',
  'Absenderangaben laut Impressum');
SELECT ok((public.rpc_email_sender() ->> 'complete')::boolean, 'sender details complete');
SELECT lives_ok($$SELECT public.rpc_set_email_enabled(true, 'Gate E bestanden und geprüft')$$, 'now sending can be switched on');
SELECT public.rpc_set_email_enabled(false, 'Test beendet, wieder aus');

-- ---------- footer in preview ----------
SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}') AS t \gset
SELECT public.rpc_save_template_draft(:'t', 'Alles Gute!', E'{{briefanrede}},\n\nherzlichen Glückwunsch!') AS v \gset
SELECT public.rpc_preview_template(:'v', :'c') AS p \gset
SELECT ok((:'p'::jsonb ->> 'text') LIKE 'Liebe Frau Kowalski,%', 'preview starts with the salutation');
SELECT ok((:'p'::jsonb ->> 'text') LIKE '%Profina Deutschland GmbH · Castroper Straße 270–280, 44791 Bochum%', 'footer: company and address');
SELECT ok((:'p'::jsonb ->> 'text') LIKE '%Amtsgericht Bochum HRB 0000 · Geschäftsführung: Erika Muster%', 'footer: register and management');
SELECT ok((:'p'::jsonb ->> 'text') LIKE '%Ihr Ansprechpartner: Fa Test%', 'footer: adviser signature');
SELECT is(:'p'::jsonb ->> 'unsubscribe_url',
  'https://app.profina.example/abmelden?t=' || (SELECT email_token FROM public.customers WHERE id = :'c') || '&z=birthday_email',
  'unsubscribe link: customer token + consent purpose, no double slash');
SELECT ok((:'p'::jsonb ->> 'html') LIKE '%<a href="https://app.profina.example/abmelden?t=%&amp;z=birthday_email">Hier abmelden</a>%',
  'html footer has an escaped unsubscribe link');

-- ---------- unsubscribe ----------
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok($$SELECT public.rpc_unsubscribe_email(gen_random_uuid(), 'birthday_email')$$, '42501', NULL,
  'only the service role (Edge Function) may unsubscribe');
SELECT tests.clear_authentication();
SELECT is(public.rpc_unsubscribe_email(gen_random_uuid(), 'birthday_email') ->> 'error', 'invalid_link', 'unknown token');
SELECT is(public.rpc_unsubscribe_email((SELECT email_token FROM public.customers WHERE id = :'c'), 'all') ->> 'error', 'invalid_link',
  'unknown purpose');
SELECT public.rpc_unsubscribe_email((SELECT email_token FROM public.customers WHERE id = :'c'), 'birthday_email');
SELECT public.rpc_unsubscribe_email((SELECT email_token FROM public.customers WHERE id = :'c'), 'birthday_email');
SELECT is((SELECT count(*) FROM public.customer_consents
            WHERE customer_id = :'c' AND purpose = 'birthday_email' AND action = 'withdrawn' AND source = 'unsubscribe_link')::int, 1,
  'one withdrawal from the link, a second click changes nothing');

SELECT * FROM finish();
ROLLBACK;
