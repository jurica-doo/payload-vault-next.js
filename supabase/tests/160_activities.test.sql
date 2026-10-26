-- ============================================================
-- r1/p4/activities
-- ============================================================
BEGIN;
SELECT plan(16);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT date_trunc('month', app_private.business_today())::date AS m, (date_trunc('month', app_private.business_today()) + interval '1 month')::date AS m_next \gset

SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_log_activity('contact_attempt', NULL, NULL, now() - interval '2 hours', NULL, 'not_reached');
SELECT public.rpc_log_activity('contact_attempt', NULL, NULL, now() - interval '1 hour', NULL, 'reached');
SELECT public.rpc_log_activity('appointment', NULL, NULL, NULL, now() - interval '30 minutes') AS appt_past \gset
SELECT public.rpc_log_activity('appointment', NULL, NULL, NULL, now() + interval '3 days') AS appt_future \gset
SELECT public.rpc_log_activity('offer', NULL, NULL, now() - interval '10 minutes', NULL, NULL, 'LV-Angebot');
SELECT public.rpc_log_activity('followup', NULL, NULL);

SELECT throws_ok($$SELECT public.rpc_log_activity('appointment')$$, '23514', NULL, 'appointments need a time');
SELECT throws_ok($$SELECT public.rpc_log_activity('offer', NULL, NULL, NULL, NULL, 'held')$$, '23514', NULL, 'outcome must fit the type');
SELECT throws_ok($$SELECT public.rpc_log_activity('call', NULL, NULL, now() + interval '1 day')$$, 'P0001', 'date_in_future', 'past activities cannot be in the future');
SELECT throws_ok($$SELECT public.rpc_log_activity('call', 'lead', NULL)$$, '23514', NULL, 'link type needs an id');

SELECT public.rpc_set_appointment_outcome(:'appt_past', 'held', 'Bedarf aufgenommen');
SELECT throws_ok(format($$SELECT public.rpc_set_appointment_outcome(%L, 'held')$$, :'appt_future'), 'P0001', 'appointment_in_future', 'cannot be held before it happens');
SELECT lives_ok(format($$SELECT public.rpc_set_appointment_outcome(%L, 'cancelled')$$, :'appt_future'), 'a future appointment can be cancelled');
SELECT throws_ok(format($$SELECT public.rpc_set_appointment_outcome(%L, 'held')$$,
  (SELECT id FROM public.activities WHERE type = 'offer')), 'P0001', 'not_an_appointment', 'only appointments have appointment outcomes');

SELECT public.rpc_activity_summary(:'e_fa', :'m', :'m_next') AS s \gset
SELECT is((:'s'::jsonb ->> 'contact_attempts')::int, 2, 'two contact attempts');
SELECT is((:'s'::jsonb ->> 'reached')::int, 1, 'one reached');
SELECT is((:'s'::jsonb ->> 'appointments_booked')::int, 2, 'two appointments booked this month');
SELECT is((:'s'::jsonb ->> 'appointments_held')::int, 1, 'one held');
SELECT is((:'s'::jsonb ->> 'offers')::int + (:'s'::jsonb ->> 'followups')::int, 2, 'offer and follow-up counted');

-- visibility
SELECT tests.authenticate_as(:'tl');
SELECT is((SELECT count(*) FROM public.activities WHERE owner_id = :'e_fa')::int, 6, 'manager sees the team''s activities');
SELECT lives_ok(format($$SELECT public.rpc_log_activity('note', NULL, NULL, NULL, NULL, NULL, 'Für FA erfasst', %L)$$, :'e_fa'), 'manager can log for a report');
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.activities)::int, 0, 'peers see nothing');
SELECT throws_ok(format($$SELECT public.rpc_activity_summary(%L, %L, %L)$$, :'e_fa', :'m', :'m_next'), '42501', 'forbidden', 'peers get no summary');

SELECT * FROM finish();
ROLLBACK;
