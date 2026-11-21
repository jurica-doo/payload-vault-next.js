-- ============================================================
-- Four eyes on settlements (migration 20261101250000)
-- ============================================================
BEGIN;
SELECT plan(2);

SELECT tests.create_user('boss@test.local', true) AS boss \gset
SELECT tests.grant_role(:'boss', 'admin');
SELECT tests.create_user('other@test.local', true) AS other \gset
SELECT tests.grant_role(:'other', 'admin');
SELECT tests.employee_id(:'boss') AS e_boss \gset

SELECT tests.authenticate_as(:'boss', 'aal2');
SELECT public.rpc_set_employee_level(:'e_boss', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_save_production(NULL, :'e_boss', 'KV', 700, 'monthly', NULL, NULL, '2026-10-10') AS p \gset
SELECT public.rpc_submit_production(:'p');
SELECT throws_ok(format($$SELECT public.rpc_mark_production_eligible(%L)$$, :'p'), '42501', 'cannot_confirm_own',
  'an admin cannot confirm their own production');
SELECT tests.authenticate_as(:'other', 'aal2');
SELECT lives_ok(format($$SELECT public.rpc_mark_production_eligible(%L)$$, :'p'), 'another admin can');

SELECT * FROM finish();
ROLLBACK;
