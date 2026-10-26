-- ============================================================
-- r1/p0/app-shell: private schema, feature flags, rpc_my_context()
-- ============================================================
-- Groundwork for the Profina sales system (requirements1/IMPLEMENTATION_PLAN.md).
--
-- app_private
--   Home for SECURITY DEFINER helpers. The schema is not exposed through the
--   Data API and the API roles get no USAGE, so nothing in it can be called
--   as an RPC. Public RPCs stay thin wrappers that check permissions first.
--
-- app_settings
--   Key/value configuration. The first key is `feature_flags`: every sales
--   module ships switched off, so unfinished modules can be merged and
--   deployed without anyone seeing them. Flags are flipped by an admin
--   (admin UI arrives with r1/p1/identity-roles; until then via SQL editor).
--   No table grants for anon/authenticated: the browser reads flags only
--   through rpc_my_context().
--
-- rpc_my_context()
--   One call that tells the browser who the user is in the sales system.
--   This version only knows the auth user, the MFA level and the flags;
--   r1/p1/identity-roles replaces it (CREATE OR REPLACE) to add the employee
--   record, granted roles and the number of descendants. The JSON shape is
--   fixed now so the frontend doesn't change when that happens.
--   Returns NULL for callers without a user (anon cannot execute it anyway).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON SCHEMA app_private FROM anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;

-- Every module off. Keys match src/data/salesModules.ts; a module is visible
-- only when both `sales` and its own key are true.
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'feature_flags',
  jsonb_build_object(
    'sales',      false,
    'production', false,
    'career',     false,
    'team',       false,
    'commission', false,
    'goals',      false,
    'leads',      false,
    'customers',  false,
    'tasks',      false,
    'admin',      false
  ),
  'Sichtbarkeit der Vertriebsmodule. Ein Modul ist sichtbar, wenn "sales" und sein eigener Schlüssel true sind.'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rpc_my_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'user_id',          auth.uid(),
    'aal',              coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'employee',         NULL::jsonb,
    'roles',            '[]'::jsonb,
    'descendant_count', 0,
    'feature_flags',    coalesce(
                          (SELECT s.value FROM public.app_settings s WHERE s.key = 'feature_flags'),
                          '{}'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_my_context() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_my_context() TO authenticated;
