-- ============================================================
-- r1/p4/lead-analytics
-- ============================================================
BEGIN;
SELECT plan(20);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('fa2@test.local', true) AS fa2 \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'fa2') AS e_fa2 \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa2', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT id AS src FROM public.lead_sources WHERE name = 'Eigener Kontakt' \gset
SELECT public.rpc_set_lead_source_cost(:'src', app_private.business_today(), 100);
SELECT date_trunc('month', app_private.business_today())::date AS w_from, (app_private.business_today() + 1) AS w_to \gset

-- fa: L1 won through every step, L2 lost after an unanswered attempt
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Eins', 'source_id', :'src')) AS l1 \gset
SELECT public.rpc_log_activity('call', 'lead', :'l1', NULL, NULL, 'reached');
SELECT public.rpc_log_activity('appointment', 'lead', :'l1', NULL, now() - interval '1 minute') AS a1 \gset
SELECT public.rpc_set_appointment_outcome(:'a1', 'held');
SELECT public.rpc_update_lead(:'l1', '{"product_interest": ["KV"]}');
SELECT public.rpc_set_lead_stage(:'l1', 'offer');
SELECT public.rpc_set_lead_stage(:'l1', 'won');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Zwei', 'source_id', :'src')) AS l2 \gset
SELECT public.rpc_log_activity('contact_attempt', 'lead', :'l2', NULL, NULL, 'not_reached');
SELECT public.rpc_set_lead_stage(:'l2', 'lost', NULL, 'not_reachable');

-- fa2: L3 untouched, L5 moved straight to offer (stages skipped)
SELECT tests.authenticate_as(:'fa2');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Drei', 'source_id', :'src')) AS l3 \gset
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Fünf', 'source_id', :'src', 'product_interest', jsonb_build_array('LV'))) AS l5 \gset
SELECT public.rpc_set_lead_stage(:'l5', 'offer');

-- tl: a pool lead, and an old lead outside the window
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Vier', 'source_id', :'src'), NULL, true) AS l4 \gset
SELECT public.rpc_create_lead(jsonb_build_object('last_name', 'Alt', 'source_id', :'src', 'received_at', now() - interval '90 days'));

-- ---------- team scope ----------
SELECT public.rpc_lead_funnel(:'w_from', :'w_to', 'team') AS t \gset
SELECT is((:'t'::jsonb -> 'totals' ->> 'leads')::int, 4, 'team cohort: leads received in the window; pool and old leads excluded');
SELECT is((:'t'::jsonb -> 'totals' ->> 'contacted')::int, 3, 'contacted = first contact or at least "Kontaktversuch"');
SELECT is((:'t'::jsonb -> 'totals' ->> 'reached')::int, 2, 'reached includes the skipped-stage lead');
SELECT is((:'t'::jsonb -> 'totals' ->> 'booked')::int, 2, 'booked');
SELECT is((:'t'::jsonb -> 'totals' ->> 'held')::int, 2, 'held');
SELECT is((:'t'::jsonb -> 'totals' ->> 'offer')::int, 2, 'offer');
SELECT is((:'t'::jsonb -> 'totals' ->> 'won')::int, 1, 'won');
SELECT is((:'t'::jsonb -> 'totals' ->> 'lost')::int, 1, 'lost');
SELECT is((:'t'::jsonb -> 'totals' ->> 'open')::int, 2, 'open');
SELECT is((:'t'::jsonb -> 'first_contact' ->> 'contacted')::int, 2, 'time to first contact only from real contact times');
SELECT is(:'t'::jsonb -> 'loss_reasons' -> 0 ->> 'reason', 'not_reachable', 'loss reasons grouped');
SELECT ok((:'t'::jsonb -> 'by_source' -> 0 -> 'cost') = 'null'::jsonb, 'no costs outside the organisation scope');
SELECT is(jsonb_array_length(:'t'::jsonb -> 'by_owner'), 2, 'one row per owner');

-- ---------- own scope ----------
SELECT tests.authenticate_as(:'fa');
SELECT is((public.rpc_lead_funnel(:'w_from', :'w_to', 'me') -> 'totals' ->> 'leads')::int, 2, 'own scope: only own leads');
SELECT throws_ok(format($$SELECT public.rpc_lead_funnel(%L, %L, 'all')$$, :'w_from', :'w_to'), '42501', 'forbidden', 'only admins see everything');

-- ---------- organisation scope ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_lead_funnel(:'w_from', :'w_to', 'all') AS a \gset
SELECT is((:'a'::jsonb -> 'totals' ->> 'unassigned')::int, 1, 'all scope includes the pool');
SELECT is((:'a'::jsonb -> 'by_source' -> 0 ->> 'cost_per_lead')::numeric, 20.00, 'cost per lead = 100 € / 5 leads');
SELECT is((:'a'::jsonb -> 'by_source' -> 0 ->> 'cost_per_sale')::numeric, 100.00, 'cost per sale = 100 € / 1 won');

-- ---------- validation ----------
SELECT throws_ok(format($$SELECT public.rpc_lead_funnel(%L, %L, 'me')$$, :'w_to', :'w_from'), '22023', 'invalid_input', 'window must be ordered');
SELECT throws_ok($$SELECT public.rpc_lead_funnel('2020-01-01', '2026-01-01', 'all')$$, '22023', 'invalid_input', 'window at most two years');

SELECT * FROM finish();
ROLLBACK;
