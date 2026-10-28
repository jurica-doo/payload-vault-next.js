-- ============================================================
-- rpc_*: SECURITY DEFINER bodies out of the exposed API schema
-- (Supabase linter 0029 authenticated_security_definer_function_executable)
-- ============================================================
-- Every write and most reads go through public.rpc_* functions that run as
-- SECURITY DEFINER and check permissions themselves (assert_admin, MFA,
-- can_see_*, reasons). That is intended, but it means the API schema held
-- 108 functions that bypass RLS, and the linter (correctly) cannot tell an
-- intended one from an accidental one.
--
-- Now:
--   * app_rpc (new, NOT exposed through the Data API) holds the unchanged
--     SECURITY DEFINER implementations; ALTER ... SET SCHEMA keeps body,
--     owner, settings, privileges and OID.
--   * public keeps a SECURITY INVOKER wrapper per function with the same
--     name, parameters, defaults, return type and volatility, so PostgREST,
--     supabase.rpc(...), the generated types and the edge functions see
--     exactly the same API. The wrapper only forwards the call; errors pass
--     through unchanged.
--   * Same roles as before can execute (authenticated, service_role); anon
--     has neither EXECUTE nor USAGE on app_rpc.
--
-- Who can do what does not change: the permission checks still live in the
-- implementations. What changes is that public contains no code that
-- bypasses RLS, so a new SECURITY DEFINER function in public shows up in the
-- advisor and fails pgTAP (000_baseline_security).
--
-- Adding or changing an RPC from now on:
--   CREATE OR REPLACE FUNCTION app_rpc.rpc_x(...) ... SECURITY DEFINER SET search_path = '' ...;
--   SELECT app_private.publish_rpc('app_rpc.rpc_x(uuid, text)'::regprocedure);
-- Never add app_rpc to the exposed schemas (config.toml [api] schemas /
-- dashboard API settings).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app_rpc;
COMMENT ON SCHEMA app_rpc IS
  'SECURITY DEFINER implementations behind the public rpc_* wrappers. Must never be an exposed API schema.';
REVOKE ALL ON SCHEMA app_rpc FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_rpc TO authenticated, service_role;

-- (Re)creates the public SECURITY INVOKER wrapper for an implementation in
-- app_rpc and sets the privileges of both. Migrations only.
CREATE OR REPLACE FUNCTION app_private.publish_rpc(
  p_impl  regprocedure,
  p_roles text[] DEFAULT ARRAY['authenticated', 'service_role']
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  f        pg_catalog.pg_proc%ROWTYPE;
  v_ident  text;
  v_call   text;
  v_target text;
  v_role   text;
BEGIN
  SELECT * INTO f FROM pg_catalog.pg_proc WHERE oid = p_impl;
  IF f.pronamespace <> 'app_rpc'::regnamespace THEN
    RAISE EXCEPTION 'publish_rpc: % is not in schema app_rpc', p_impl;
  END IF;
  IF f.prokind <> 'f' OR f.provariadic <> 0 THEN
    RAISE EXCEPTION 'publish_rpc: % must be a plain, non-variadic function', p_impl;
  END IF;

  v_ident  := pg_catalog.pg_get_function_identity_arguments(p_impl);
  v_target := format('public.%I(%s)', f.proname, v_ident);
  v_call   := format('app_rpc.%I(%s)', f.proname,
                     (SELECT coalesce(string_agg('$' || i, ', ' ORDER BY i), '')
                        FROM generate_series(1, f.pronargs) AS i));

  -- DROP first so a changed return type does not block the replace.
  EXECUTE format('DROP FUNCTION IF EXISTS %s', v_target);
  EXECUTE format(
    'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql %s SECURITY INVOKER SET search_path = '''' AS %L',
    f.proname,
    pg_catalog.pg_get_function_arguments(p_impl),
    pg_catalog.pg_get_function_result(p_impl),
    CASE f.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN f.proretset THEN 'SELECT * FROM ' || v_call ELSE 'SELECT ' || v_call END);
  EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_target,
                 format('API wrapper (SECURITY INVOKER) for app_rpc.%s, created by app_private.publish_rpc.', f.proname));

  -- Explicit privileges on both: Supabase's default privileges would
  -- otherwise hand the new wrapper to anon, and Postgres to PUBLIC.
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_target);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', p_impl);
  FOREACH v_role IN ARRAY p_roles LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_target, v_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_impl, v_role);
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION app_private.publish_rpc(regprocedure, text[])
  FROM PUBLIC, anon, authenticated, service_role;

-- Move every SECURITY DEFINER function that signed-in users can call
-- (all public.rpc_*) and publish its wrapper.
DO $$
DECLARE
  v_oids oid[];
  v_oid  oid;
BEGIN
  SELECT coalesce(array_agg(p.oid ORDER BY p.proname), '{}')
    INTO v_oids
    FROM pg_catalog.pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prokind = 'f'
     AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  FOREACH v_oid IN ARRAY v_oids LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA app_rpc',
                   (SELECT proname FROM pg_catalog.pg_proc WHERE oid = v_oid),
                   pg_catalog.pg_get_function_identity_arguments(v_oid));
    PERFORM app_private.publish_rpc(v_oid::regprocedure);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace
                AND p.prosecdef
                AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     OR has_function_privilege('anon', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'rpc move incomplete: a SECURITY DEFINER function in public is still callable by API roles';
  END IF;
  RAISE NOTICE 'rpc functions moved to app_rpc: %', coalesce(array_length(v_oids, 1), 0);
END
$$;

NOTIFY pgrst, 'reload schema';
