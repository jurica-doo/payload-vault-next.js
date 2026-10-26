-- ============================================================
-- r1/p0/app-shell: app_private, app_settings, rpc_my_context()
-- ============================================================
BEGIN;
SELECT plan(14);

SELECT tests.create_user('shell@test.local') AS uid \gset

-- ---------- app_private is not reachable by API roles ----------
SELECT ok(NOT has_schema_privilege('anon', 'app_private', 'USAGE'), 'anon has no USAGE on app_private');
-- authenticated got USAGE in r1/p1/identity-roles (RLS policy helpers run as
-- the caller); it still may not execute anything that isn't a policy helper.
SELECT ok(NOT has_function_privilege('authenticated', 'app_private.require_reason(text,integer)', 'EXECUTE'),
  'authenticated cannot execute non-policy helpers in app_private');

-- ---------- app_settings ----------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_settings'::regclass), 'app_settings has RLS on');
SELECT is(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'app_settings' AND grantee IN ('anon', 'authenticated', 'PUBLIC'))::int,
  0, 'no table grants on app_settings for anon/authenticated');

SELECT is(
  (SELECT count(*) FROM jsonb_each((SELECT value FROM public.app_settings WHERE key = 'feature_flags')) f
    WHERE f.value <> 'false'::jsonb)::int,
  0, 'every feature flag ships switched off');

SELECT throws_ok(
  $$INSERT INTO public.app_settings (key, value) VALUES ('Bad-Key', '{}')$$,
  '23514', NULL, 'setting keys must be lowercase snake_case');

SELECT tests.authenticate_as(:'uid');
SELECT throws_ok('SELECT * FROM public.app_settings', '42501', NULL, 'authenticated cannot read app_settings directly');
SELECT throws_ok($$UPDATE public.app_settings SET value = '{"sales": true}' WHERE key = 'feature_flags'$$,
  '42501', NULL, 'authenticated cannot flip feature flags');
SELECT tests.clear_authentication();

-- ---------- rpc_my_context ----------
SELECT ok(NOT has_function_privilege('anon', 'public.rpc_my_context()', 'EXECUTE'), 'anon cannot run rpc_my_context');

SELECT tests.authenticate_as(:'uid');
SELECT is((public.rpc_my_context() ->> 'user_id')::uuid, :'uid'::uuid, 'context returns the caller');
SELECT is(public.rpc_my_context() ->> 'aal', 'aal1', 'context reports aal1 before MFA');
SELECT is(public.rpc_my_context() -> 'feature_flags' -> 'sales', 'false'::jsonb, 'context includes the flags');
SELECT ok(public.rpc_my_context() ? 'employee' AND public.rpc_my_context() ? 'roles' AND public.rpc_my_context() ? 'descendant_count',
  'context has the full shape the frontend expects');

SELECT tests.authenticate_as(:'uid', 'aal2');
SELECT is(public.rpc_my_context() ->> 'aal', 'aal2', 'context reports aal2 after MFA');

SELECT * FROM finish();
ROLLBACK;
