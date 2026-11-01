-- ============================================================
-- app_private: no function executable through the PUBLIC default
-- ============================================================
-- Postgres grants EXECUTE on every new function to PUBLIC. A per-schema
-- `ALTER DEFAULT PRIVILEGES … IN SCHEMA app_private` (identity_roles) can't
-- take that global default away, so most app_private functions — many of
-- them SECURITY DEFINER, e.g. erase_lead — were executable by anyone who
-- can reach the schema (authenticated has USAGE for RLS). Not reachable
-- through the API (app_private isn't exposed), but it removed a layer of
-- defence.
--
-- Now:
--   * PUBLIC loses EXECUTE on every app_private function. The helpers RLS
--     and invoker views need (has_role, can_see_*, visible_employee_ids, …)
--     keep their explicit grants to authenticated from their migrations.
--   * Functions postgres creates from now on are no longer executable by
--     PUBLIC. Schemas that need API access grant explicitly: public via
--     Supabase's default privileges, app_rpc via app_private.publish_rpc.
-- pgTAP 000_baseline_security fails if a PUBLIC grant comes back.
-- ============================================================

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p
     WHERE p.pronamespace = 'app_private'::regnamespace
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn);
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
