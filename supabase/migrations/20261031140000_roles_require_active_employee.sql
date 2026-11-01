-- ============================================================
-- Roles rest while their holder is deactivated
-- ============================================================
-- Deactivating an employee removed their sales access, but not their roles:
-- has_role() only looked at user_roles. A deactivated admin, finance or
-- compliance user kept every right of that role — e.g. a deactivated finance
-- user still saw the commission statements of all employees.
--
-- Now a role counts only while its holder is not a deactivated employee:
--   * has_role() (every permission check, RLS and RPC) ignores the roles of
--     deactivated employees;
--   * rpc_my_context() lists only effective roles, so the menus follow;
--   * the last-admin guard counts only effective admins.
-- The role rows stay untouched (history, and reactivation restores them).
-- Accounts without an employee record (role-only accounts) are unaffected.
-- ============================================================

-- True when the user belongs to an employee record that is deactivated.
CREATE OR REPLACE FUNCTION app_private.is_deactivated_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.user_id = p_user_id AND e.status = 'inactive'
  )
$$;

REVOKE EXECUTE ON FUNCTION app_private.is_deactivated_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.has_role(p_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = auth.uid() AND r.role = p_role AND r.revoked_at IS NULL
  )
  AND NOT app_private.is_deactivated_user(auth.uid())
$$;

CREATE OR REPLACE FUNCTION app_rpc.rpc_my_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'user_id',  auth.uid(),
    'aal',      coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'employee', (SELECT jsonb_build_object(
                    'id', e.id, 'first_name', e.first_name, 'last_name', e.last_name,
                    'status', e.status,
                    'level_code', app_private.level_at(e.id, app_private.business_today()))
                   FROM public.employees e WHERE e.user_id = auth.uid()),
    'roles',    coalesce((SELECT jsonb_agg(r.role ORDER BY r.role)
                            FROM public.user_roles r
                           WHERE r.user_id = auth.uid() AND r.revoked_at IS NULL
                             AND NOT app_private.is_deactivated_user(auth.uid())), '[]'::jsonb),
    'descendant_count', coalesce((
                    SELECT count(*)::int FROM app_private.descendants_at(
                      app_private.current_employee_id(), app_private.business_today())), 0),
    'feature_flags', coalesce(
                       (SELECT s.value FROM public.app_settings s WHERE s.key = 'feature_flags'),
                       '{}'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_rpc.rpc_revoke_role(p_user_id uuid, p_role public.app_role, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);

  -- Serialise concurrent revocations so two admins can't remove each other.
  PERFORM pg_advisory_xact_lock(hashtext('user_roles:admin'));

  -- Only effective admins count: a deactivated admin can't administer.
  IF p_role = 'admin' AND (
    SELECT count(*) FROM public.user_roles r
     WHERE r.role = 'admin' AND r.revoked_at IS NULL AND r.user_id <> p_user_id
       AND NOT app_private.is_deactivated_user(r.user_id)
  ) = 0 THEN
    RAISE EXCEPTION 'last_admin' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_roles
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE user_id = p_user_id AND role = p_role AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;
