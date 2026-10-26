-- ============================================================
-- r1/p5/consent
-- ============================================================
BEGIN;
SELECT plan(22);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT id AS src FROM public.lead_sources WHERE name = 'Empfehlung' \gset

SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer('{"first_name": "Erika", "last_name": "Muster", "email": "erika@example.org", "phone": "+491701112223"}') AS c1 \gset

-- ---------- no basis yet ----------
SELECT is(public.rpc_may_contact(:'c1', 'contact_email') ->> 'reason', 'no_legal_basis', 'no record → no contact');
SELECT is(public.rpc_may_contact(:'c1', 'birthday_email') ->> 'reason', 'no_birth_date', 'birthday mail needs a birth date');

-- ---------- grant ----------
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'marketing_email', 'granted', 'consent', 'form')$$, :'c1'),
  '22023', 'consent_evidence_required', 'a consent needs evidence');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'marketing_email', 'granted', NULL, 'form', 'Formular')$$, :'c1'),
  '23514', NULL, 'granting needs a legal basis');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'marketing_email', 'granted', 'consent', 'form', 'Formular', now() + interval '1 day')$$, :'c1'),
  'P0001', 'date_in_future', 'not in the future');
SELECT public.rpc_record_consent(:'c1', 'marketing_email', 'granted', 'consent', 'form', 'Beratungsprotokoll vom 01.10.2026', now() - interval '20 days');
SELECT public.rpc_record_consent(:'c1', 'contact_phone', 'granted', 'contract', 'in_person');
SELECT is((public.rpc_may_contact(:'c1', 'marketing_email') ->> 'allowed')::boolean, true, 'granted consent → allowed');
SELECT is(public.rpc_may_contact(:'c1', 'marketing_email') ->> 'legal_basis', 'consent', '…with its legal basis');
SELECT is((public.rpc_may_contact(:'c1', 'contact_phone') ->> 'allowed')::boolean, true, 'contract basis for phone contact');

-- ---------- withdraw ----------
SELECT public.rpc_record_consent(:'c1', 'marketing_email', 'withdrawn', NULL, 'email', 'Mail vom Kunden');
SELECT is(public.rpc_may_contact(:'c1', 'marketing_email') ->> 'reason', 'withdrawn', 'withdrawal wins over the older grant');
SELECT is((SELECT count(*) FROM public.customer_consents WHERE customer_id = :'c1' AND purpose = 'marketing_email')::int, 2,
  'history is kept');
SELECT is((SELECT action FROM public.v_customer_consent_state WHERE customer_id = :'c1' AND purpose = 'marketing_email'), 'withdrawn',
  'current-state view');
-- A back-dated older grant entered later does not override the newer withdrawal.
SELECT public.rpc_record_consent(:'c1', 'marketing_email', 'granted', 'consent', 'letter', 'Alter Brief nachgetragen', now() - interval '30 days');
SELECT is(public.rpc_may_contact(:'c1', 'marketing_email') ->> 'reason', 'withdrawn', 'state follows effective time, not entry order');

-- ---------- global opt-out ----------
SELECT public.rpc_record_consent(:'c1', 'all', 'opt_out', NULL, 'phone', 'Kunde wünscht keine Kontaktaufnahme');
SELECT is(public.rpc_may_contact(:'c1', 'contact_phone') ->> 'reason', 'opt_out', 'opt-out overrides every basis');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'all', 'granted', 'consent', 'form', 'xxxxx')$$, :'c1'),
  '23514', NULL, 'the global switch only knows opt-out / opt-in');
SELECT public.rpc_record_consent(:'c1', 'all', 'opt_in', NULL, 'phone', 'Widerspruch zurückgenommen');
SELECT is((public.rpc_may_contact(:'c1', 'contact_phone') ->> 'allowed')::boolean, true, 'opt-in restores the previous bases');

-- ---------- append-only & permissions ----------
SELECT tests.clear_authentication();
SELECT throws_ok($$UPDATE public.customer_consents SET source = 'form'$$, '42501', 'append_only', 'consents cannot be edited');
SELECT throws_ok($$DELETE FROM public.customer_consents$$, '42501', 'append_only', '…or deleted');
SELECT tests.authenticate_as(:'peer');
SELECT throws_ok(format($$SELECT public.rpc_may_contact(%L, 'contact_phone')$$, :'c1'), 'P0002', 'not_found', 'peers cannot check others'' customers');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'all', 'opt_out', NULL, 'phone')$$, :'c1'), '42501', 'forbidden', '…or record for them');
SELECT tests.authenticate_as(:'comp');
SELECT is((SELECT count(*) FROM public.customer_consents)::int, 6, 'compliance reads the consent history');
SELECT is((public.rpc_consent_report() ->> 'customers')::int, 1, 'compliance gets the overview');

-- ---------- lead conversion copies the basis ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Neu', 'email', 'neu@example.org', 'source_id', :'src', 'consent_basis', 'consent')) AS l1 \gset
SELECT public.rpc_convert_lead(:'l1') AS c2 \gset
SELECT is((public.rpc_may_contact(:'c2', 'contact_email') ->> 'allowed')::boolean, true, 'converted lead keeps its contact basis');

SELECT * FROM finish();
ROLLBACK;
