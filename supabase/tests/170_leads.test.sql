-- ============================================================
-- r1/p4/leads
-- ============================================================
BEGIN;
SELECT plan(57);

-- ---------- SLA business hours (golden cases, mirrored in src/domain/sla.test.ts) ----------
SELECT is(app_private.add_business_hours('2026-11-02 10:00 Europe/Berlin', 8), '2026-11-03 10:00 Europe/Berlin'::timestamptz,
  'GC-SLA-001 Mon 10:00 + 8h → Tue 10:00');
SELECT is(app_private.add_business_hours('2026-11-06 16:00 Europe/Berlin', 2), '2026-11-09 10:00 Europe/Berlin'::timestamptz,
  'GC-SLA-002 Fri 16:00 + 2h → Mon 10:00 (weekend skipped)');
SELECT is(app_private.add_business_hours('2026-11-07 12:00 Europe/Berlin', 1), '2026-11-09 10:00 Europe/Berlin'::timestamptz,
  'GC-SLA-003 received Saturday → counts from Monday 09:00');
SELECT is(app_private.add_business_hours('2026-12-24 16:00 Europe/Berlin', 4), '2026-12-28 12:00 Europe/Berlin'::timestamptz,
  'GC-SLA-004 Christmas holidays and weekend skipped');
SELECT is(app_private.add_business_hours('2026-10-23 15:00 Europe/Berlin', 8), '2026-10-26 15:00 Europe/Berlin'::timestamptz,
  'GC-SLA-005 across the DST change: wall-clock 15:00 on Monday');
SELECT is(app_private.add_business_hours('2026-11-03 07:30 Europe/Berlin', 0.5), '2026-11-03 09:30 Europe/Berlin'::timestamptz,
  'GC-SLA-006 before opening → counts from 09:00');
SELECT is(app_private.add_business_hours('2026-11-04 18:00 Europe/Berlin', 1), '2026-11-05 10:00 Europe/Berlin'::timestamptz,
  'GC-SLA-007 after closing → next morning');

-- ---------- setup ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('fa2@test.local', true) AS fa2 \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa,
       tests.employee_id(:'fa2') AS e_fa2, tests.employee_id(:'peer') AS e_peer, tests.employee_id(:'admin') AS e_admin \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa2', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT id AS src FROM public.lead_sources WHERE name = 'Eigener Kontakt' \gset

-- ---------- create ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_lead(jsonb_build_object('first_name', 'Max', 'last_name', 'Müller', 'phone', '+491701234567',
  'email', 'Max.Mueller@Example.org', 'source_id', :'src')) AS l1 \gset
SELECT is((SELECT stage FROM public.leads WHERE id = :'l1'), 'assigned', 'self-created lead is owned and assigned');
SELECT is((SELECT email FROM public.leads WHERE id = :'l1'), 'max.mueller@example.org', 'email stored lowercased');
SELECT ok((SELECT sla_due_at > received_at FROM public.leads WHERE id = :'l1'), 'first-contact deadline set');
SELECT is((SELECT count(*) FROM public.lead_assignments WHERE lead_id = :'l1')::int, 1, 'creation is in the assignment history');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Anders', 'phone', '+491701234567', 'source_id', %L))$$, :'src'),
  'P0001', 'possible_duplicate', 'same phone → duplicate warning');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('first_name', 'Max', 'last_name', 'Mueller', 'source_id', %L))$$, :'src'),
  'P0001', 'possible_duplicate', 'similar name → duplicate warning');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'X', 'phone', '0170 123', 'source_id', %L))$$, :'src'),
  '22023', 'invalid_phone', 'phone must be E.164');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('first_name', 'Nur', 'source_id', %L))$$, :'src'),
  '22023', 'lead_name_required', 'needs a last name or company');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Chef', 'source_id', %L), %L)$$, :'src', :'e_tl'),
  '42501', 'forbidden', 'cannot create leads for a manager');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Pool', 'source_id', %L), NULL, true)$$, :'src'),
  '42501', 'forbidden', 'advisers cannot fill the pool');

SELECT tests.authenticate_as(:'peer');
SELECT is((public.rpc_find_lead_duplicates(NULL, 'Meier', NULL, NULL, 'max.mueller@example.org') -> 0 ->> 'visible')::boolean, false,
  'duplicates of other people are reported…');
SELECT ok((public.rpc_find_lead_duplicates(NULL, 'Meier', NULL, NULL, 'max.mueller@example.org') -> 0 ->> 'name') IS NULL, '…without their details');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Meier', 'email', 'max.mueller@example.org', 'source_id', :'src'),
  NULL, false, true) AS l_dup \gset
SELECT is((SELECT count(*) FROM public.leads)::int, 1, 'peers see only their own leads');

-- ---------- pool and assignment ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_create_lead(jsonb_build_object('company', 'Bäckerei Sonne GmbH', 'source_id', :'src'), NULL, true) AS l_pool \gset
SELECT is((SELECT stage FROM public.leads WHERE id = :'l_pool'), 'new', 'pool lead starts as new');
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_pool')::int, 0, 'advisers do not see the pool');
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_pool')::int, 1, 'leaders see the pool');
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_assign_lead(:'l_pool', :'e_fa');
SELECT is((SELECT stage FROM public.leads WHERE id = :'l_pool'), 'assigned', 'first assignment needs no reason and moves to assigned');
SELECT throws_ok(format($$SELECT public.rpc_assign_lead(%L, %L)$$, :'l_pool', :'e_fa2'), '22023', 'reason_required', 'reassignment needs a reason');
SELECT throws_ok(format($$SELECT public.rpc_assign_lead(%L, %L, 'Kollege aus anderem Team')$$, :'l_pool', :'e_peer'), '42501', 'forbidden',
  'cannot assign outside the own structure');
SELECT tests.authenticate_as(:'fa');
SELECT ok(EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'lead_assigned'), 'new owner is notified');
SELECT throws_ok(format($$SELECT public.rpc_assign_lead(%L, %L, 'Ich gebe den Lead ab')$$, :'l1', :'e_fa2'), '42501', 'forbidden',
  'advisers cannot hand leads to colleagues');

-- ---------- pipeline ----------
SELECT public.rpc_log_activity('contact_attempt', 'lead', :'l1', now() - interval '1 hour', NULL, 'not_reached');
SELECT is((SELECT stage FROM public.leads WHERE id = :'l1'), 'contact_attempted', 'contact attempt moves the lead');
SELECT ok((SELECT first_contact_at IS NOT NULL FROM public.leads WHERE id = :'l1'), 'first contact recorded');
SELECT public.rpc_log_activity('call', 'lead', :'l1', now() - interval '30 minutes', NULL, 'reached');
SELECT is((SELECT stage FROM public.leads WHERE id = :'l1'), 'contacted', 'reached → contacted');
SELECT throws_ok(format($$SELECT public.rpc_set_lead_stage(%L, 'qualified')$$, :'l1'), 'P0001', 'stage_requirements_missing',
  'qualified needs a product interest');
SELECT public.rpc_update_lead(:'l1', '{"product_interest": ["KV"]}');
SELECT lives_ok(format($$SELECT public.rpc_set_lead_stage(%L, 'qualified')$$, :'l1'), 'with product interest it works');
SELECT throws_ok(format($$SELECT public.rpc_set_lead_stage(%L, 'contacted')$$, :'l1'), '22023', 'reason_required', 'going back needs a reason');
SELECT throws_ok(format($$SELECT public.rpc_set_lead_stage(%L, 'appointment_held')$$, :'l1'), 'P0001', 'stage_requirements_missing',
  'held needs a held appointment');
SELECT public.rpc_log_activity('appointment', 'lead', :'l1', NULL, now() + interval '2 days') AS appt \gset
SELECT is((SELECT stage FROM public.leads WHERE id = :'l1'), 'appointment_booked', 'booking moves the lead');
SELECT is((SELECT count(*) FROM public.lead_stage_history WHERE lead_id = :'l1')::int, 5, 'every stage entry is in the history');
SELECT throws_ok(format($$SELECT public.rpc_log_activity('note', 'lead', %L)$$, :'l_dup'), '42501', 'forbidden',
  'no activities on other people''s leads');

SELECT tests.authenticate_as(:'tl');
SELECT is((public.rpc_assign_lead(:'l1', :'e_fa2', 'Urlaub der Beraterin, Kollegin übernimmt') ->> 'appointments_moved')::int, 1,
  'reassignment moves the upcoming appointment');
SELECT is((SELECT owner_id FROM public.activities WHERE id = :'appt'), :'e_fa2'::uuid, '…to the new owner');
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l1')::int, 0, 'the previous owner loses access');
SELECT tests.authenticate_as(:'fa2');
SELECT throws_ok(format($$SELECT public.rpc_set_lead_stage(%L, 'lost')$$, :'l1'), 'P0001', 'stage_requirements_missing', 'lost needs a reason code');
SELECT public.rpc_set_lead_stage(:'l1', 'lost', 'Zu teuer', 'price');
SELECT ok((SELECT closed_at IS NOT NULL AND loss_reason = 'price' FROM public.leads WHERE id = :'l1'), 'lost closes the lead');
SELECT tests.authenticate_as(:'tl');
SELECT throws_ok(format($$SELECT public.rpc_assign_lead(%L, %L, 'Noch einmal versuchen bitte')$$, :'l1', :'e_fa'), 'P0001', 'lead_closed',
  'closed leads are not reassigned');

-- ---------- merge ----------
SELECT throws_ok(format($$SELECT public.rpc_merge_leads(%L, %L, 'Gleiche Person, doppelt erfasst')$$, :'l1', :'l_dup'), '42501', 'forbidden',
  'merging needs access to both leads');
SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_merge_leads(%L, %L, 'Gleiche Person, doppelt erfasst')$$, :'l1', :'l_dup'), '42501', 'mfa_required',
  'admins need MFA');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_merge_leads(:'l1', :'l_dup', 'Gleiche Person, doppelt erfasst');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_dup')::int, 0, 'merged leads disappear from lists');

-- ---------- append-only ----------
SELECT tests.clear_authentication();
SELECT is((SELECT merged_into FROM public.leads WHERE id = :'l_dup'), :'l1'::uuid, 'duplicate points to the kept lead');
SELECT throws_ok($$UPDATE public.lead_stage_history SET note = 'x'$$, '42501', 'append_only', 'stage history is append-only');
SELECT throws_ok($$DELETE FROM public.lead_assignments$$, '42501', 'append_only', 'assignment history is append-only');

-- ---------- generators ----------
SELECT tests.authenticate_as(:'fa2');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Spät', 'source_id', :'src', 'received_at', now() - interval '10 days')) AS l_late \gset
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Pool Zwei', 'source_id', :'src'), NULL, true) AS l_pool2 \gset
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT priority FROM public.tasks WHERE type = 'lead_first_contact' AND linked_id = :'l_late' AND status = 'open'), 'high',
  'overdue first contact → high-priority task for the owner');
SELECT ok(EXISTS (SELECT 1 FROM public.notifications WHERE recipient_id = :'e_tl' AND kind = 'lead_sla_breach'), 'and the manager is notified');
SELECT is((SELECT owner_id FROM public.tasks WHERE type = 'lead_unassigned' AND linked_id = :'l_pool2' AND status = 'open'), :'e_tl'::uuid,
  'pool lead → task for the leader who created it');
SELECT tests.authenticate_as(:'fa2');
SELECT public.rpc_log_activity('call', 'lead', :'l_late', NULL, NULL, 'reached');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT status FROM public.tasks WHERE type = 'lead_first_contact' AND linked_id = :'l_late'), 'cancelled', 'contact closes the task');
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'lead_next_action' AND linked_id = :'l_late' AND status = 'open')::int, 1,
  'contacted lead without a next step → reminder');

-- ---------- settings ----------
SELECT tests.authenticate_as(:'tl');
SELECT throws_ok($$SELECT public.rpc_set_lead_sla('{"first_contact_hours": 4}', 'Profina hat entschieden')$$, '42501', 'forbidden', 'only admins set the SLA');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok($$SELECT public.rpc_set_lead_sla('{"first_contact_hours": 4, "workday_start": "18:00", "workday_end": "08:00", "workdays": [1], "escalate_to_manager": true}', 'Profina hat entschieden')$$,
  '22023', 'invalid_input', 'working day must be valid');

SELECT * FROM finish();
ROLLBACK;
