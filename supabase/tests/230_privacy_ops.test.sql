-- ============================================================
-- r1/p5/privacy-ops
-- ============================================================
BEGIN;
SELECT plan(25);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT id AS src FROM public.lead_sources WHERE name = 'Empfehlung' \gset

-- data to erase
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_lead(jsonb_build_object('first_name', 'Erika', 'last_name', 'Geheim', 'email', 'erika@geheim.de',
  'phone', '+491709998887', 'source_id', :'src', 'consent_basis', 'consent', 'notes', 'Kinder: zwei')) AS l1 \gset
SELECT public.rpc_log_activity('call', 'lead', :'l1', NULL, NULL, 'reached', 'Gesundheitszustand besprochen');
SELECT public.rpc_convert_lead(:'l1') AS c1 \gset
SELECT public.rpc_update_customer(:'c1', '{"date_of_birth": "1980-01-01", "street": "Geheimweg 1", "next_follow_up_at": "2026-01-01T10:00:00Z"}');
SELECT public.rpc_record_consent(:'c1', 'marketing_email', 'granted', 'consent', 'form', 'Unterschrift Erika Geheim');
SELECT public.rpc_save_contract_link(NULL, :'c1', '{"external_contract_id": "KV-777", "category_code": "KV", "status": "active"}');
SELECT public.rpc_save_service_item(NULL, :'c1', 'pending_documents', 'Attest von Erika Geheim', '2026-01-01');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT lead_no AS l1_no FROM public.leads WHERE id = :'l1' \gset
SELECT ok((SELECT count(*) FROM public.tasks WHERE linked_id = :'c1') > 0, 'customer has tasks with her name');

-- ---------- permissions ----------
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_open_privacy_request('access', 'customer', %L, 'email')$$, :'c1'), '42501', 'forbidden',
  'advisers cannot handle privacy requests');
SELECT tests.authenticate_as(:'comp');
SELECT throws_ok(format($$SELECT public.rpc_open_privacy_request('access', 'customer', %L, 'email')$$, :'c1'), '42501', 'mfa_required',
  'compliance needs MFA');
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT is((public.rpc_find_privacy_subject('lead', :'l1_no') ->> 'customer_id')::uuid, :'c1'::uuid,
  'subjects are found by number, leads included');
SELECT throws_ok($$SELECT public.rpc_open_privacy_request('access', 'customer', gen_random_uuid(), 'email')$$, 'P0002', 'not_found', 'subject must exist');

-- ---------- access ----------
SELECT public.rpc_open_privacy_request('access', 'customer', :'c1', 'email', 'Auskunftsersuchen per Mail') AS r_access \gset
SELECT ok((SELECT due_at = received_at + interval '1 month' FROM public.privacy_requests WHERE id = :'r_access'), 'due in one month');
SELECT throws_ok(format($$SELECT public.rpc_erase_subject(%L)$$, :'r_access'), 'P0001', 'wrong_request_kind', 'an access request does not allow erasure');
SELECT public.rpc_export_subject_data(:'r_access') AS ex \gset
SELECT is(:'ex'::jsonb -> 'data' -> 'customer' ->> 'email', 'erika@geheim.de', 'export contains the profile');
SELECT is(jsonb_array_length(:'ex'::jsonb -> 'data' -> 'consents'), 3, '…consents (2 from lead + 1)');
SELECT is(jsonb_array_length(:'ex'::jsonb -> 'data' -> 'contracts'), 1, '…contracts');
SELECT is(jsonb_array_length(:'ex'::jsonb -> 'data' -> 'activities'), 1, '…activities from the lead time');
SELECT ok(:'ex'::jsonb -> 'data' -> 'lead' IS NOT NULL, '…and the original lead');
SELECT is((SELECT status FROM public.privacy_requests WHERE id = :'r_access'), 'completed', 'export completes the request');
SELECT is((SELECT count(*) FROM public.export_log WHERE request_id = :'r_access')::int, 1, 'export is logged');
SELECT throws_ok(format($$SELECT public.rpc_export_subject_data(%L)$$, :'r_access'), 'P0001', 'invalid_status', 'one export per request');

-- ---------- erasure ----------
SELECT public.rpc_open_privacy_request('erasure', 'customer', :'c1', 'letter') AS r_erase \gset
SELECT throws_ok(format($$SELECT public.rpc_close_privacy_request(%L, 'completed', 'Erledigt per Hand im System')$$, :'r_erase'), 'P0001',
  'use_dedicated_action', 'erasure is completed only by erasing');
SELECT public.rpc_erase_subject(:'r_erase');
SELECT tests.clear_authentication();
SELECT ok((SELECT erased_at IS NOT NULL AND last_name IS NULL AND email IS NULL AND date_of_birth IS NULL AND street IS NULL
             AND status = 'former' FROM public.customers WHERE id = :'c1'), 'customer pseudonymised');
SELECT ok((SELECT erased_at IS NOT NULL AND email IS NULL AND phone IS NULL AND notes IS NULL FROM public.leads WHERE id = :'l1'), 'the original lead too');
SELECT ok((SELECT bool_and(notes IS NULL) FROM public.activities WHERE linked_id IN (:'c1', :'l1')), 'activity notes removed');
SELECT ok((SELECT bool_and(evidence IS NULL) FROM public.customer_consents WHERE customer_id = :'c1')
       AND (SELECT count(*) FROM public.customer_consents WHERE customer_id = :'c1') = 3, 'consent events kept, evidence removed');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.tasks WHERE title LIKE '%Geheim%') AND NOT EXISTS (SELECT 1 FROM public.customer_service_items WHERE title LIKE '%Geheim%'),
  'no name left in tasks or service items');
SELECT is((SELECT count(*) FROM public.contract_links WHERE customer_id = :'c1')::int, 1, 'contract link kept (business record)');
SELECT ok(NOT EXISTS (SELECT 1 FROM audit.events WHERE coalesce(new_values, '{}')::text || coalesce(old_values, '{}')::text LIKE '%Geheim%'),
  'the audit log never contained the name');
SELECT throws_ok($$UPDATE public.customer_consents SET evidence = NULL$$, '42501', 'append_only', 'outside an erasure consents stay immutable');

-- ---------- retention ----------
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT ok((public.rpc_retention_candidates() -> 'customers') = 'null'::jsonb, 'no retention period configured (OD-16) → no candidates');

SELECT * FROM finish();
ROLLBACK;
