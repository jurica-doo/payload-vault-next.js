-- ============================================================
-- Phase 4 review fixes (requirements1/phase-4-leads-tasks/verification/r1-p4-verification.md)
-- Rows carry real timestamps (received_at, generators use now()).
-- ============================================================
BEGIN;
SET LOCAL app.business_today = '';
SELECT plan(28);

-- ---------- setup: two structures (dl → tl → fa) and (tl2 → fa3) ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('tl2@test.local', true) AS tl2 \gset
SELECT tests.create_user('fa3@test.local', true) AS fa3 \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa,
       tests.employee_id(:'tl2') AS e_tl2, tests.employee_id(:'fa3') AS e_fa3 \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl2', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa3', :'e_tl2', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_lead_sla('{"first_contact_hours": 8, "workday_start": "09:00", "workday_end": "17:00", "workdays": [1,2,3,4,5], "holiday_region": "DE", "escalate_to_manager": true}',
  'Eskalation für den Test an');
SELECT id AS src FROM public.lead_sources WHERE name = 'Eigener Kontakt' \gset

-- ---------- P4-SEC-01: pool leads stay in the creator's structure ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Poolkunde', 'phone', '+491731112223', 'source_id', :'src'), NULL, true) AS l_pool \gset
SELECT tests.authenticate_as(:'tl2');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_pool')::int, 0, 'P4-SEC-01 leader of another structure does not see the pool lead');
SELECT throws_ok(format($$SELECT public.rpc_update_lead(%L, '{"region": "fremd"}')$$, :'l_pool'), '42501', 'forbidden',
  'P4-SEC-01 … cannot edit it');
SELECT throws_ok(format($$SELECT public.rpc_log_activity('call', 'lead', %L)$$, :'l_pool'), '42501', 'forbidden',
  'P4-SEC-01 … cannot log activities on it');
SELECT throws_ok(format($$SELECT public.rpc_assign_lead(%L, %L)$$, :'l_pool', :'e_fa3'), '42501', 'forbidden',
  'P4-SEC-01 … cannot take it for the own team');
SELECT is((public.rpc_find_lead_duplicates(NULL, NULL, NULL, '+491731112223', NULL) -> 0 ->> 'visible')::boolean, false,
  'P4-SEC-01 duplicate check reports it without details');
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_pool')::int, 1, 'P4-SEC-01 the creator''s manager sees it');
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_pool')::int, 0, 'P4-SEC-01 advisers still do not see the pool');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is((SELECT count(*) FROM public.leads WHERE id = :'l_pool')::int, 1, 'P4-SEC-01 admins see every pool lead');

-- ---------- P4-API-01 / P4-API-02 / P4-DATA-03 ----------
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Key', 'foo', 1, 'source_id', %L))$$, :'src'),
  '22023', 'invalid_input', 'P4-API-01 unknown keys are rejected on create');
SELECT throws_ok(format($$SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Lang', 'notes', repeat('x', 4001), 'source_id', %L))$$, :'src'),
  '22023', 'text_too_long', 'P4-API-02 lead notes over 4,000 characters');
SELECT throws_ok($$SELECT public.rpc_log_activity('call', NULL, NULL, NULL, NULL, NULL, repeat('x', 4001))$$,
  '22023', 'text_too_long', 'P4-API-02 activity notes over 4,000 characters');
SELECT throws_ok($$SELECT public.rpc_log_activity('call', NULL, NULL, NULL, NULL, 'held')$$,
  '22023', 'outcome_not_allowed', 'P4-API-02 outcome must fit the activity type');
SELECT throws_ok(format($$SELECT public.rpc_create_task(%L, 'ab')$$, :'e_fa'), '22023', 'title_too_short', 'P4-API-02 task title too short');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Leerfeld', 'region', '  ', 'campaign', '', 'referral', '', 'source_id', :'src')) AS l_empty \gset
SELECT ok((SELECT region IS NULL AND campaign IS NULL AND referral IS NULL FROM public.leads WHERE id = :'l_empty'),
  'P4-DATA-03 empty optional texts are stored as NULL');

-- ---------- P4-DATA-01: appointments and offers are a first contact ----------
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Terminkunde', 'source_id', :'src',
  'received_at', now() - interval '10 days')) AS l_appt \gset
SELECT public.rpc_log_activity('appointment', 'lead', :'l_appt', NULL, now() + interval '1 day');
SELECT ok((SELECT first_contact_at IS NOT NULL FROM public.leads WHERE id = :'l_appt'), 'P4-DATA-01 booking an appointment sets the first contact');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Angebotskunde', 'source_id', :'src')) AS l_offer \gset
SELECT public.rpc_log_activity('offer', 'lead', :'l_offer');
SELECT ok((SELECT first_contact_at IS NOT NULL FROM public.leads WHERE id = :'l_offer'), 'P4-DATA-01 an offer sets the first contact');

-- ---------- P4-NOTIF-01: one digest per recipient and kind ----------
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Spät Eins', 'source_id', :'src', 'received_at', now() - interval '10 days')) AS l_late1 \gset
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Spät Zwei', 'source_id', :'src', 'received_at', now() - interval '10 days')) AS l_late2 \gset
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Spät Drei', 'source_id', :'src', 'received_at', now() - interval '10 days')) AS l_late3 \gset
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'lead_first_contact' AND linked_id = :'l_appt' AND status = 'open')::int, 0,
  'P4-DATA-01 no Erstkontakt task for a lead with a booked appointment');
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'lead_first_contact' AND owner_id = :'e_fa' AND status = 'open')::int, 4,
  'P4-NOTIF-01 one task per uncontacted lead (3 overdue + Leerfeld)');
SELECT is((SELECT count(*) FROM public.notifications WHERE recipient_id = :'e_fa' AND kind = 'lead_first_contact')::int, 1,
  'P4-NOTIF-01 … but one notification for the owner');
SELECT is((SELECT title FROM public.notifications WHERE recipient_id = :'e_fa' AND kind = 'lead_first_contact'), 'Erstkontakt: 4 neue Einträge',
  'P4-NOTIF-01 the digest names the count');
SELECT is((SELECT count(*) FROM public.notifications WHERE recipient_id = :'e_tl' AND kind = 'lead_sla_breach')::int, 1,
  'P4-NOTIF-01 the manager gets one escalation digest');
SELECT is((SELECT link FROM public.notifications WHERE recipient_id = :'e_tl' AND kind = 'lead_sla_breach'), '/vertrieb/leads?ansicht=team&sla=overdue',
  'P4-NOTIF-01 the digest links to the filtered list');
SELECT count(*) AS n_before FROM public.notifications \gset
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.notifications)::int, :n_before::int,
  'P4-NOTIF-01 a second run sends nothing new');
SELECT is((SELECT count(*) FROM public.notifications WHERE recipient_id = :'e_tl' AND kind = 'lead_unassigned')::int, 1,
  'P4-NOTIF-01 a single item keeps its own title (pool task for tl)');

-- ---------- P4-UX-10: system tasks close themselves ----------
SELECT id AS t_sys FROM public.tasks WHERE type = 'lead_first_contact' AND linked_id = :'l_late1' AND status = 'open' \gset
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_set_task_status(%L, 'done')$$, :'t_sys'), 'P0001', 'system_task_auto',
  'P4-UX-10 a system task cannot be ticked off');
SELECT throws_ok(format($$SELECT public.rpc_set_task_status(%L, 'cancelled', 'Kein Bedarf mehr')$$, :'t_sys'), '42501', 'forbidden',
  'P4-UX-10 the owner cannot dismiss it');
SELECT tests.authenticate_as(:'tl');
SELECT throws_ok(format($$SELECT public.rpc_set_task_status(%L, 'cancelled', 'kurz')$$, :'t_sys'), '22023', 'reason_required',
  'P4-UX-10 dismissing needs a reason');
SELECT public.rpc_set_task_status(:'t_sys', 'cancelled', 'Kunde hat sich selbst gemeldet');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'lead_first_contact' AND linked_id = :'l_late1' AND status = 'open')::int, 0,
  'P4-UX-10 a dismissed task is not recreated');

SELECT * FROM finish();
ROLLBACK;
