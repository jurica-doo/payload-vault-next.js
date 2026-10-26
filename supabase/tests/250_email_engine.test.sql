-- ============================================================
-- r1/p6/email-engine
-- ============================================================
BEGIN;
SELECT plan(27);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
-- Born in leap year 2000 so every calendar day (29 Feb included) can be "today".
SELECT make_date(2000, extract(month FROM app_private.business_today())::int, extract(day FROM app_private.business_today())::int) AS bday,
       app_private.business_today() AS today, app_private.business_today() AS occ \gset

-- customers
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Anna', 'last_name', 'Alpha', 'email', 'anna@example.org', 'date_of_birth', :'bday')) AS c_ok \gset
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Bert', 'last_name', 'Beta', 'email', 'bert@example.org', 'date_of_birth', :'bday')) AS c_none \gset
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Carl', 'last_name', 'Gamma', 'email', 'carl@example.org', 'date_of_birth', :'bday')) AS c_li \gset
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Dora', 'last_name', 'Delta', 'email', 'dora@example.org', 'date_of_birth', :'bday')) AS c_supp \gset
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Emil', 'last_name', 'Epsilon', 'email', 'emil@example.org', 'date_of_birth', '1980-01-01')) AS c_other \gset
SELECT public.rpc_create_customer(jsonb_build_object('last_name', 'Ohnevorname', 'email', 'ohne@example.org', 'date_of_birth', :'bday')) AS c_missing \gset
SELECT public.rpc_record_consent(:'c_ok', 'birthday_email', 'granted', 'consent', 'form', 'Formular Beratung');
SELECT public.rpc_record_consent(:'c_li', 'birthday_email', 'granted', 'legitimate_interest', 'in_person');
SELECT public.rpc_record_consent(:'c_supp', 'birthday_email', 'granted', 'consent', 'form', 'Formular Beratung');
SELECT public.rpc_record_consent(:'c_missing', 'birthday_email', 'granted', 'consent', 'form', 'Formular Beratung');
SELECT public.rpc_record_consent(:'c_other', 'birthday_email', 'granted', 'consent', 'form', 'Formular Beratung');

-- template + campaign (four-eyes twice)
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}') AS t \gset
SELECT public.rpc_save_template_draft(:'t', 'Alles Gute, {{vorname}}!', E'Liebe/r {{vorname}},\n\nherzlichen Glückwunsch!') AS v1 \gset
SELECT public.rpc_submit_template_version(:'v1');
SELECT public.rpc_set_suppression('Dora@Example.org', true, 'manual', 'Kundin wünscht keine Mails');
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT public.rpc_decide_template_version(:'v1', true);
SELECT public.rpc_save_campaign(NULL, 'Geburtstage', :'t', 'birthday', NULL) AS k \gset
SELECT throws_ok(format($$SELECT public.rpc_save_campaign(NULL, 'Falsch', %L, 'one_off', '2000-01-01')$$, :'t'), 'P0001', 'date_in_past',
  'one-off campaigns need a future date');
SELECT public.rpc_set_campaign_status(:'k', 'submit');
SELECT throws_ok(format($$SELECT public.rpc_set_campaign_status(%L, 'approve')$$, :'k'), '42501', 'cannot_approve_own', 'four-eyes on campaigns');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_campaign_status(:'k', 'approve');
SELECT is((SELECT template_version_id FROM public.email_campaigns WHERE id = :'k'), :'v1'::uuid, 'approval pins the template version');

-- ---------- kill switch ----------
SELECT tests.clear_authentication();
SELECT is(app_private.plan_email_sends(:'occ') -> 'paused', 'true'::jsonb, 'switched off by default: nothing is planned');
SELECT is((SELECT count(*) FROM public.email_send_log)::int, 0, '…and nothing logged');
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT throws_ok($$SELECT public.rpc_set_email_enabled(true, 'Gate E bestanden und geprüft')$$, '42501', 'forbidden', 'compliance cannot switch sending on');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_email_enabled(true, 'Gate E bestanden und geprüft');
SELECT public.rpc_set_email_window('00:00', '23:59', '{1,2,3,4,5,6,7}', 500, 'Test: ganztägig senden');

-- ---------- planning ----------
SELECT tests.clear_authentication();
SELECT app_private.plan_email_sends(:'occ');
SELECT is((SELECT count(*) FROM public.email_send_log WHERE mode = 'live')::int, 5, 'every birthday is logged, including suppressed ones');
SELECT is((SELECT status FROM public.email_send_log WHERE customer_id = :'c_ok'), 'queued', 'consent + allowed basis → queued');
SELECT is((SELECT suppression_reason FROM public.email_send_log WHERE customer_id = :'c_none'), 'no_legal_basis', 'no consent → suppressed with reason');
SELECT is((SELECT suppression_reason FROM public.email_send_log WHERE customer_id = :'c_li'), 'basis_not_allowed', 'basis not accepted by the template');
SELECT is((SELECT suppression_reason FROM public.email_send_log WHERE customer_id = :'c_supp'), 'suppressed_address', 'suppression list respected');
SELECT is((SELECT suppression_reason FROM public.email_send_log WHERE customer_id = :'c_missing'), 'missing_merge_field', 'no "Liebe ," mails');
SELECT is((SELECT count(*) FROM public.email_send_log WHERE customer_id = :'c_other')::int, 0, 'no mail without a birthday');
SELECT app_private.plan_email_sends(:'occ');
SELECT is((SELECT count(*) FROM public.email_send_log WHERE mode = 'live')::int, 5, 'planning twice creates no duplicates');

-- ---------- send-time re-check ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_record_consent(:'c_ok', 'birthday_email', 'withdrawn', NULL, 'email', 'Widerruf per Mail');
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Fritz', 'last_name', 'Phi', 'email', 'fritz@example.org', 'date_of_birth', :'bday')) AS c_send \gset
SELECT public.rpc_record_consent(:'c_send', 'birthday_email', 'granted', 'consent', 'form', 'Formular Beratung');
SELECT tests.clear_authentication();
SELECT app_private.plan_email_sends(:'occ');
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok($$SELECT public.rpc_claim_email_sends(10)$$, '42501', NULL, 'users cannot claim sends');
SELECT tests.authenticate_as_service_role();
SELECT public.rpc_claim_email_sends(10) AS batch \gset
SELECT is(jsonb_array_length(:'batch'::jsonb), 1, 'one mail goes out');
SELECT is(:'batch'::jsonb -> 0 ->> 'subject', 'Alles Gute, Fritz!', '…rendered with the pinned version');
SELECT is((SELECT suppression_reason FROM public.email_send_log WHERE customer_id = :'c_ok'), 'withdrawn',
  'consent withdrawn after planning → suppressed at send time');
SELECT public.rpc_report_email_result((:'batch'::jsonb -> 0 ->> 'id')::uuid, true, 'msg-1');
SELECT is((SELECT status FROM public.email_send_log WHERE customer_id = :'c_send'), 'sent', 'result recorded');
SELECT public.rpc_record_email_event('msg-1', 'bounced');
SELECT ok(EXISTS (SELECT 1 FROM public.email_suppressions WHERE email = 'fritz@example.org' AND reason = 'bounce'), 'bounce → suppression list');

-- ---------- global pause keeps history, test mode still works ----------
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT public.rpc_set_email_enabled(false, 'Pause wegen Prüfung der Texte');
SELECT public.rpc_send_test_email(:'v1');
SELECT tests.authenticate_as_service_role();
SELECT public.rpc_claim_email_sends(10) AS batch2 \gset
SELECT is(jsonb_array_length(:'batch2'::jsonb), 1, 'paused: only the test mail is released');
SELECT ok(:'batch2'::jsonb -> 0 ->> 'subject' LIKE '[TEST]%' AND :'batch2'::jsonb -> 0 ->> 'to' = 'comp@test.local',
  'test mail goes to the requesting officer only');
SELECT ok((SELECT count(*) FROM public.email_send_log WHERE mode = 'live') = 6, 'history preserved while paused');

-- ---------- expiry and erasure ----------
SELECT tests.clear_authentication();
INSERT INTO public.email_send_log (campaign_id, customer_id, template_version_id, occasion_date, recipient, status)
VALUES (:'k', :'c_other', :'v1', :'today'::date - 3, 'emil@example.org', 'queued');
UPDATE public.app_settings SET value = jsonb_set(value, '{enabled}', 'true') WHERE key = 'email';
SELECT tests.authenticate_as_service_role();
SELECT public.rpc_claim_email_sends(10);
SELECT is((SELECT status FROM public.email_send_log WHERE customer_id = :'c_other'), 'expired', 'late mails expire instead of arriving days later');
SELECT tests.clear_authentication();
UPDATE public.customers SET erased_at = now(), first_name = NULL, last_name = NULL, email = NULL WHERE id = :'c_send';
SELECT ok((SELECT recipient IS NULL FROM public.email_send_log WHERE customer_id = :'c_send'), 'erasure removes the address from the log');

-- ---------- visibility ----------
SELECT tests.authenticate_as(:'fa');
SELECT ok((SELECT count(*) FROM public.email_send_log) >= 5, 'advisers see the history of their customers (§10.1)');
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.email_send_log)::int, 0, 'peers see none');

SELECT * FROM finish();
ROLLBACK;
