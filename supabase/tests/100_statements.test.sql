-- ============================================================
-- r1/p2/statements
-- ============================================================
BEGIN;
SELECT plan(20);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fb', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_fb', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_dl', 'DL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fb', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');

CREATE FUNCTION pg_temp.produce(p_emp uuid, p_premium numeric, p_date date) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.rpc_save_production(NULL, p_emp, 'KV', p_premium, 'monthly', NULL, NULL, p_date);
  PERFORM public.rpc_submit_production(v);
  PERFORM public.rpc_mark_production_eligible(v);
  RETURN v;
END $$;

-- FB: 10 own points (560) + differential on FA's 10 points (280); DL: diff on both.
SELECT tests.grant_role(:'admin', 'finance');
SELECT pg_temp.produce(:'e_fb', 280, '2026-03-01');
SELECT pg_temp.produce(:'e_fa', 280, '2026-03-02');
SELECT date_trunc('month', app_private.business_today())::date AS m \gset

-- ---------- statement (§14.2) ----------
SELECT tests.authenticate_as(:'fb');
SELECT public.rpc_statement(:'m') AS s \gset
SELECT is(:'s'::jsonb -> 'buckets' -> 'personal', '{"gross": 560.00, "reserve": 56.00, "net": 504.00, "entries": 1}'::jsonb,
  'own production: 560 gross, 56 reserve, 504 after reserve (§14.2)');
SELECT is(:'s'::jsonb -> 'buckets' -> 'direct', '{"gross": 280.00, "reserve": 28.00, "net": 252.00, "entries": 1}'::jsonb,
  'direct differential shown separately: 280 / 28 / 252 (§14.2)');
SELECT is(:'s'::jsonb -> 'buckets' -> 'indirect' ->> 'entries', '0', 'empty indirect bucket still present');
SELECT is(:'s'::jsonb -> 'total' ->> 'net', '756.00', 'total after reserve');
SELECT is(:'s'::jsonb ->> 'period_status', 'open', 'period status included');
SELECT throws_ok(format($$SELECT public.rpc_statement(%L, %L)$$, :'m', :'e_dl'), '42501', 'forbidden', 'cannot read a manager''s statement');

SELECT tests.authenticate_as(:'dl');
SELECT is(public.rpc_statement(:'m') -> 'buckets' -> 'direct' ->> 'gross', '560.00', 'DL: differential on FB''s points is direct');
SELECT is(public.rpc_statement(:'m') -> 'buckets' -> 'indirect' ->> 'gross', '560.00', 'DL: differential on FA''s points is indirect');
SELECT throws_ok(format($$SELECT public.rpc_statement(%L, %L)$$, :'m', :'e_fb'), '42501', 'forbidden', 'leader cannot read a team statement by default (OD-17)');

-- ---------- overview ----------
SELECT throws_ok(format($$SELECT * FROM public.rpc_statement_overview(%L)$$, :'m'), '42501', 'forbidden', 'overview is for finance');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT is((SELECT count(*) FROM public.rpc_statement_overview(:'m'))::int, 3, 'three recipients in the month');
SELECT is((SELECT sum(gross) FROM public.rpc_statement_overview(:'m')), 2240.00::numeric, 'overview total = 2 × 10 P × 112 €');
SELECT lives_ok(format($$SELECT public.rpc_statement(%L, %L)$$, :'m', :'e_fa'), 'finance can read any statement');

-- ---------- workflow ----------
SELECT throws_ok(format($$SELECT public.rpc_set_statement_status(%L, 'approved', 'Direkt freigeben')$$, :'m'),
  'P0001', 'invalid_transition', 'open cannot jump to approved');
SELECT public.rpc_set_statement_status(:'m', 'reviewed', 'Prüfung durch Finanzen');
SELECT throws_ok(format($$SELECT public.rpc_set_statement_status(%L, 'approved', 'Monat freigeben')$$, :'m'),
  'P0001', 'month_not_ended', 'the running month cannot be approved');
SELECT public.rpc_set_statement_status(:'m', 'open', 'Korrektur eines Vertrags nötig');
SELECT is((SELECT status FROM public.statement_periods WHERE period_month = :'m'), 'open', 'reviewed month can be reopened');

-- a past month goes all the way
SELECT public.rpc_set_statement_status('2026-02-01', 'reviewed', 'Prüfung Februar');
SELECT public.rpc_set_statement_status('2026-02-01', 'approved', 'Freigabe Februar');
SELECT public.rpc_set_statement_status('2026-02-01', 'paid', 'Ausgezahlt Februar');
SELECT throws_ok($$SELECT public.rpc_set_statement_status('2026-02-01', 'open', 'Doch nochmal öffnen')$$,
  'P0001', 'invalid_transition', 'paid is final');
SELECT tests.clear_authentication();
SELECT is((SELECT reason FROM audit.events WHERE entity_type = 'public.statement_periods' AND new_values ->> 'status' = 'paid'),
  'Ausgezahlt Februar', 'status changes are audited with the reason');

SELECT tests.authenticate_as(:'fin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_set_statement_status(%L, 'reviewed', 'Prüfung ohne MFA')$$, :'m'),
  '42501', 'mfa_required', 'workflow needs MFA');

-- ---------- export log ----------
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT public.rpc_log_export('statement_overview', jsonb_build_object('month', :'m'), 3);
SELECT tests.clear_authentication();
SELECT is((SELECT new_values ->> 'rows' FROM audit.events WHERE action = 'export.statement_overview'), '3', 'export is recorded with its size');

SELECT * FROM finish();
ROLLBACK;
