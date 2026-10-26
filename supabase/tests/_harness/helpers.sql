-- ============================================================
-- Test helpers (runs as supabase_admin, AFTER migrations + seed)
-- ============================================================
-- Every *.test.sql file runs inside BEGIN … ROLLBACK, so anything these
-- helpers create disappears after the file. Usage inside a test:
--
--   SELECT tests.create_user('ana@test.local') AS ana \gset
--   SELECT tests.authenticate_as(:'ana');          -- behaves like her JWT
--   SELECT tests.authenticate_as(:'ana', 'aal2');  -- after MFA
--   SELECT tests.authenticate_as_anon();
--   SELECT tests.authenticate_as_service_role();
--   SELECT tests.clear_authentication();           -- back to postgres
--
-- Because SET ROLE is transaction-scoped here (set_config(..., true)),
-- helpers must be called with SELECT, not PERFORM, at top level.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO postgres, anon, authenticated, service_role;

-- Creates an auth user. The signup gate (allowlist today, employee invites
-- from r1/p1/identity-roles on) is satisfied first, so tests exercise the
-- real trigger instead of disabling it.
CREATE OR REPLACE FUNCTION tests.create_user(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF to_regclass('public.signup_allowlist') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.signup_allowlist (email) VALUES (lower($1))
             ON CONFLICT DO NOTHING' USING p_email;
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          lower(p_email), '{}'::jsonb, '{}'::jsonb, now(), now());

  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION tests.authenticate_as(p_user_id uuid, p_aal text DEFAULT 'aal1')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  PERFORM set_config('role', 'authenticated', true);
END
$$;

CREATE OR REPLACE FUNCTION tests.authenticate_as_anon()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
END
$$;

CREATE OR REPLACE FUNCTION tests.authenticate_as_service_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
END
$$;

CREATE OR REPLACE FUNCTION tests.clear_authentication()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'postgres', true);
END
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO postgres, anon, authenticated, service_role;
GRANT authenticated, anon, service_role TO postgres;
