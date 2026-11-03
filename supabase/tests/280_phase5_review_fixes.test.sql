-- ============================================================
-- Phase 5 review fixes (requirements1/phase-5-crm/verification/r1-p5-verification.md)
-- ============================================================
BEGIN;
SET LOCAL app.business_today = '';
SELECT plan(19);

SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');

SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer('{"first_name": "Wilma", "last_name": "Widerspruch", "phone": "+491701112233"}') AS c1 \gset

-- ---------- P5-API-01: named keys ----------
SELECT throws_ok(format($$SELECT public.rpc_update_customer(%L, jsonb_build_object('notes', repeat('x', 4001)))$$, :'c1'),
  '22023', 'text_too_long', 'P5-API-01 customer notes over 4,000 characters');
SELECT throws_ok(format($$SELECT public.rpc_update_customer(%L, '{"postal_code": "!"}')$$, :'c1'),
  '22023', 'invalid_postal_code', 'P5-API-01 invalid postal code');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'fax', 'granted', 'contract', 'form')$$, :'c1'),
  '22023', 'consent_invalid', 'P5-API-01 unknown consent purpose');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'contact_phone', 'withdrawn', 'consent', 'phone')$$, :'c1'),
  '22023', 'consent_invalid', 'P5-API-01 a withdrawal has no legal basis');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "E-1", "start_date": "2026-05-01", "end_date": "2020-01-01"}', true)$$, :'c1'),
  '22023', 'contract_dates_order', 'P5-API-01 contract end before start');
SELECT throws_ok(format($$SELECT public.rpc_save_service_item(NULL, %L, 'other', 'ab', '2027-01-01')$$, :'c1'),
  '22023', 'title_too_short', 'P5-API-01 service title too short');

-- ---------- P5-API-02 ----------
SELECT throws_ok(format($$SELECT public.rpc_save_service_item(NULL, %L, 'contract_renewal', 'Hauptfälligkeit', NULL)$$, :'c1'),
  'P0001', 'renewal_date_unconfirmed', 'P5-API-02 renewal without contract');

-- ---------- P5-UX-05 ----------
SELECT throws_ok(format($$SELECT public.rpc_update_customer(%L, jsonb_build_object('next_follow_up_at', now() - interval '1 day'))$$, :'c1'),
  '22023', 'date_in_past', 'P5-UX-05 follow-up in the past refused');
SELECT lives_ok(format($$SELECT public.rpc_update_customer(%L, jsonb_build_object('next_follow_up_at', now() + interval '1 day'))$$, :'c1'),
  'P5-UX-05 future follow-up accepted');
SELECT lives_ok(format($$SELECT public.rpc_update_customer(%L, '{"next_follow_up_at": null}')$$, :'c1'),
  'P5-UX-05 clearing the follow-up still works');

-- ---------- P5-UX-06 ----------
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"source_system": "portal", "external_contract_id": "P-1"}')$$, :'c1'),
  '22023', 'manual_source_only', 'P5-UX-06 manual links cannot claim the portal source');
SELECT lives_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "M-1"}')$$, :'c1'),
  'P5-UX-06 a manual link is saved as manual');

-- ---------- P5-PRIV-01 ----------
SELECT tests.authenticate_as(:'comp');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'all', 'opt_out', NULL, 'letter')$$, :'c1'),
  '42501', 'mfa_required', 'P5-PRIV-01 compliance needs 2FA for an opt-out');
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_record_consent(%L, 'marketing_email', 'granted', 'consent', 'form', 'Formular vom Kunden')$$, :'c1'),
  '42501', 'forbidden', 'P5-PRIV-01 compliance never records a grant');
SELECT lives_ok(format($$SELECT public.rpc_record_consent(%L, 'marketing_email', 'withdrawn', NULL, 'letter')$$, :'c1'),
  'P5-PRIV-01 compliance records a withdrawal');
SELECT public.rpc_open_privacy_request('objection', 'customer', :'c1', 'letter', 'Kein Kontakt mehr gewünscht') AS r1 \gset
SELECT is((SELECT subject_no FROM public.privacy_requests WHERE id = :'r1'), (SELECT customer_no FROM public.customers WHERE id = :'c1'),
  'P5-UX-02 the request carries the customer number');
SELECT public.rpc_apply_objection(:'r1');
SELECT is(public.rpc_may_contact(:'c1', 'contact_phone') ->> 'reason', 'opt_out',
  'P5-PRIV-01 applying the objection blocks every contact');
SELECT is((SELECT status FROM public.privacy_requests WHERE id = :'r1'), 'completed', 'P5-PRIV-01 … and completes the request');
SELECT is((SELECT evidence FROM public.customer_consents WHERE customer_id = :'c1' AND purpose = 'all' ORDER BY id DESC LIMIT 1),
  'Datenschutzanfrage DS-' || (SELECT request_no FROM public.privacy_requests WHERE id = :'r1'), 'P5-PRIV-01 … with the request as evidence');

SELECT * FROM finish();
ROLLBACK;
