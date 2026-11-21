-- ============================================================
-- Lead settings for role-only admins (migration 20261101230000)
-- ============================================================
BEGIN;
SELECT plan(3);

SELECT tests.create_user('roleadmin@test.local') AS ra \gset
SELECT tests.grant_role(:'ra', 'admin');
SELECT tests.create_user('nobody@test.local') AS nb \gset

SELECT tests.authenticate_as(:'ra', 'aal2');
SELECT ok(public.rpc_lead_config() ? 'sla', 'an admin without an employee record reads the lead settings');
SELECT tests.authenticate_as(:'nb');
SELECT throws_ok($$SELECT public.rpc_lead_config()$$, '42501', 'forbidden', 'a vault-only user still cannot');
SELECT tests.clear_authentication();
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.rpc_lead_config()'::regprocedure), false, 'public wrapper stays invoker');

SELECT * FROM finish();
ROLLBACK;
