-- ============================================================
-- Starting levels before the first rules version (migration 20261101240000)
-- ============================================================
BEGIN;
SELECT plan(3);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('old@test.local', true) AS old \gset
SELECT tests.employee_id(:'old') AS e_old \gset
UPDATE public.employees SET start_date = '2025-04-01' WHERE id = :'e_old';

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is(public.rpc_set_employee_level(:'e_old', 'FB', '2025-04-01', 'Einstieg laut Vertrag 2025'), 'initial',
  'FB from 01.04.2025 is accepted (checked against the first rules version)');
SELECT throws_ok(format($$SELECT public.rpc_set_employee_level(%L, 'VDP', '2025-05-01', 'Ernennung rückwirkend')$$, :'e_old'),
  'P0001', 'level_not_in_rules', 'VD+ before 01.11.2026 is still refused');
SELECT tests.clear_authentication();
SELECT is(app_private.level_at(:'e_old', '2026-11-20'), 'FB', 'the level holds today');

SELECT * FROM finish();
ROLLBACK;
