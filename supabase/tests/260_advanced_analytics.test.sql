-- ============================================================
-- r1/p6/advanced-analytics
-- ============================================================
BEGIN;
SELECT plan(16);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('fa2@test.local', true) AS fa2 \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'fa2') AS e_fa2 \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa2', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT id AS src FROM public.lead_sources WHERE name = 'Profina-Kampagne' \gset
SELECT public.rpc_set_lead_source_cost(:'src', app_private.business_today(), 300);

-- 12 leads 31–59 days ago, all contacted; 12 leads in the last 30 days, 4 contacted.
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Alt ' || i, 'source_id', :'src', 'received_at', now() - interval '40 days'), NULL, false, true)
  FROM generate_series(1, 12) i;
SELECT tests.clear_authentication();
UPDATE public.leads SET first_contact_at = received_at + interval '1 hour' WHERE last_name LIKE 'Alt %';
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Neu ' || i, 'source_id', :'src', 'received_at', now() - interval '5 days'), NULL, false, true)
  FROM generate_series(1, 12) i;
SELECT tests.clear_authentication();
UPDATE public.leads SET first_contact_at = received_at + interval '1 hour' WHERE last_name IN ('Neu 1', 'Neu 2', 'Neu 3', 'Neu 4');

-- ---------- signals ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_team_signals() AS sig \gset
SELECT ok(:'sig'::jsonb @> '[{"code": "contact_rate_down"}]', 'contact rate 33 % vs 100 % → prompt');
SELECT is((SELECT (x -> 'now' ->> 'den')::int FROM jsonb_array_elements(:'sig'::jsonb) x WHERE x ->> 'code' = 'contact_rate_down'), 12,
  'signal carries its denominator');
SELECT ok(:'sig'::jsonb @> '[{"code": "sla_breaches_up"}]', 'more uncontacted leads past the deadline');
SELECT ok(:'sig'::jsonb @> jsonb_build_array(jsonb_build_object('code', 'leads_without_next_step', 'employee_id', :'e_fa')), 'person with many contacted leads without a next step');
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok($$SELECT public.rpc_team_signals()$$, '42501', 'forbidden', 'advisers get no team signals');
SELECT tests.authenticate_as(:'fa2');
SELECT throws_ok($$SELECT public.rpc_team_signals()$$, '42501', 'forbidden', '…nor anyone without a structure');

-- ---------- source trends ----------
SELECT throws_ok($$SELECT public.rpc_source_trends(12)$$, '42501', 'forbidden', 'source money is admin-only');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_source_trends(3) AS tr \gset
SELECT ok(jsonb_array_length(:'tr'::jsonb) >= 1, 'months with leads or costs are returned');
SELECT is((SELECT sum((x ->> 'leads')::int) FROM jsonb_array_elements(:'tr'::jsonb) x WHERE x ->> 'name' = 'Profina-Kampagne')::int, 24,
  'every lead counted once in its receipt month');
SELECT ok(EXISTS (SELECT 1 FROM jsonb_array_elements(:'tr'::jsonb) x WHERE (x ->> 'cost')::numeric = 300), 'cost appears in its month');

-- ---------- auto-assignment ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Pool A', 'source_id', :'src'), NULL, true) AS pa \gset
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT ok((SELECT owner_id IS NULL FROM public.leads WHERE id = :'pa'), 'off by default: pool stays');
SELECT tests.authenticate_as(:'tl');
SELECT throws_ok($$SELECT public.rpc_set_lead_auto_assign(true, 30, 'Pilot im Team Nord')$$, '42501', 'forbidden', 'only admins switch it on');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_lead_auto_assign(true, 30, 'Pilot im Team Nord');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT owner_id FROM public.leads WHERE id = :'pa'), :'e_fa2'::uuid, 'goes to the least-loaded team member (fa has 24, fa2 none)');
SELECT is((SELECT stage FROM public.leads WHERE id = :'pa'), 'assigned', '…and moves to "Zugewiesen"');
SELECT ok((SELECT assigned_by IS NULL AND reason LIKE 'Automatische%' FROM public.lead_assignments WHERE lead_id = :'pa'), 'recorded as a system assignment');
SELECT ok(EXISTS (SELECT 1 FROM public.tasks WHERE type = 'lead_first_contact' AND linked_id = :'pa' AND owner_id = :'e_fa2'),
  'first-contact task created in the same run');

SELECT * FROM finish();
ROLLBACK;
