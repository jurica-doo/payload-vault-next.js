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

-- Creates an auth user.
--   tests.create_user(email)          plain user, like a legacy vault-only
--                                     account (bypasses the signup gate)
--   tests.create_user(email, true)    active employee: employee row + invite,
--                                     then the auth user goes through the real
--                                     invite gate, link and activation triggers
CREATE OR REPLACE FUNCTION tests.create_user(p_email text, p_employee boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid := gen_random_uuid();
  v_email text := lower(p_email);
  v_emp   uuid;
BEGIN
  IF p_employee THEN
    INSERT INTO public.employees (first_name, last_name, email, start_date)
    VALUES (initcap(split_part(v_email, '@', 1)), 'Test', v_email, DATE '2026-01-01')
    RETURNING id INTO v_emp;
    INSERT INTO public.employee_invites (employee_id, email, expires_at)
    VALUES (v_emp, v_email, now() + interval '1 day');
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            v_email, '{}'::jsonb, '{}'::jsonb, now(), now());
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- Legacy-style user: insert without firing the signup gate.
  SET LOCAL session_replication_role = replica;
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          v_email, '{}'::jsonb, '{}'::jsonb, now(), now());
  SET LOCAL session_replication_role = origin;
  RETURN v_id;
END
$$;

-- Grants a role directly (tests only; production uses rpc_grant_role).
CREATE OR REPLACE FUNCTION tests.grant_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role::public.app_role);
$$;

CREATE OR REPLACE FUNCTION tests.employee_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.employees WHERE user_id = p_user_id;
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
