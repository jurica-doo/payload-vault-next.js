-- ============================================================
-- r1/p2/subsidy
-- ============================================================
BEGIN;
SELECT plan(18);

SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('pt@test.local', true) AS pt \gset
SELECT tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'pt') AS e_pt \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_employee_level(:'e_fb', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_pt', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_update_employee(:'e_pt', 'Pia', 'Teilzeit', NULL, '2026-01-01', 'part_time', 'Wechsel in Teilzeit');

SELECT tests.authenticate_as(:'fb');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', 400, 'Volumen gedeckt', 'Zuschuss September')$$, :'e_fb'),
  '42501', 'forbidden', 'employees cannot grant subsidies');

SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT public.rpc_set_subsidy(:'e_fb', '2026-09-15', 400, 'Produktion deckt Zuschuss', 'Zuschuss September');
SELECT is((SELECT jsonb_build_array(month, max_amount_snapshot, approved_amount) FROM public.subsidy_records WHERE employee_id = :'e_fb'),
  '["2026-09-01", 500.00, 400.00]'::jsonb, 'stored for the month with the level ceiling as a snapshot (§6.4)');

SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', 600, 'Viel Umsatz', 'Erhöhung September')$$, :'e_fb'),
  'P0001', 'subsidy_above_maximum', 'above the FB ceiling of 500 is refused');
SELECT lives_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', 600, 'Viel Umsatz', 'Erhöhung September', 'Sondervereinbarung GF vom 01.09.')$$, :'e_fb'),
  'above the ceiling with an explicit override');
SELECT is((SELECT count(*) FROM public.subsidy_records WHERE employee_id = :'e_fb' AND status = 'approved')::int, 1, 'one approved record per month');
SELECT is((SELECT count(*) FROM public.subsidy_records WHERE employee_id = :'e_fb' AND status = 'superseded')::int, 1, 'previous record kept as superseded');

SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', 100, 'Einstieg', 'Zuschuss Einstieg')$$, :'e_fa'),
  'P0001', 'subsidy_above_maximum', 'FA has no standard maximum → override required (§2)');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', 500, 'Teilzeitzuschuss', 'Zuschuss September')$$, :'e_pt'),
  'P0001', 'subsidy_above_maximum', 'part-time needs an override (maxima are for full-time)');
SELECT lives_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', 0, 'Kein Zuschuss, Volumen nicht gedeckt', 'Monat ohne Zuschuss')$$, :'e_fa'),
  'zero is always allowed');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2025-12-01', 100, 'Vor Eintritt', 'Zuschuss Dezember')$$, :'e_fb'),
  'P0001', 'before_start_date', 'not before the start month');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-09-01', -5, 'Negativ', 'Rückforderung')$$, :'e_fb'),
  '23514', NULL, 'negative amounts are not subsidies');

-- locked months
SELECT public.rpc_set_statement_status('2026-08-01', 'reviewed', 'Prüfung August');
SELECT public.rpc_set_statement_status('2026-08-01', 'approved', 'Freigabe August');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, '2026-08-01', 300, 'Nachtrag', 'Zuschuss August nachtragen')$$, :'e_fb'),
  'P0001', 'period_locked', 'approved months cannot change');

-- statement and overview
SELECT is(public.rpc_statement('2026-09-01', :'e_fb') -> 'subsidy' ->> 'approved', '600.00', 'statement shows the subsidy separately');
SELECT is((public.rpc_statement('2026-09-01', :'e_fb') -> 'subsidy' ->> 'override')::boolean, true, 'statement flags an override');
SELECT is((SELECT subsidy FROM public.rpc_statement_overview('2026-09-01') WHERE recipient_id = :'e_fb'), 600.00::numeric,
  'overview lists subsidies even without commission');

SELECT public.rpc_revoke_subsidy(:'e_fb', '2026-09-01', 'Zuschuss zurückgenommen');
SELECT ok(public.rpc_statement('2026-09-01', :'e_fb') -> 'subsidy' = 'null'::jsonb OR public.rpc_statement('2026-09-01', :'e_fb') -> 'subsidy' IS NULL,
  'revoked subsidy disappears from the statement');

-- visibility
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.subsidy_records WHERE employee_id <> :'e_fa')::int, 0, 'employees see only their own subsidies');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM audit.events WHERE entity_type = 'public.subsidy_records')::int >= 4, true, 'subsidy changes are audited');

SELECT * FROM finish();
ROLLBACK;
