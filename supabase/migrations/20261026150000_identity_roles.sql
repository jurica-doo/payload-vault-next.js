-- ============================================================
-- r1/p1/identity-roles: employees, invites, roles, MFA-gated admin RPCs
-- ============================================================
-- Decision D2 (IMPLEMENTATION_PLAN.md): admins invite employees; public
-- signup is closed. The allowlist trigger is replaced by an invite gate:
-- a new auth user can only be created for an email with a pending,
-- unexpired invite.
--
-- Flow
--   1. Admin (role admin + MFA aal2) calls rpc_create_employee().
--        * email already belongs to an auth user (legacy vault user)
--          → linked immediately, status 'active', no invite needed
--        * otherwise → status 'invited' + invite row (7 days)
--   2. Edge Function invite-employee calls rpc_issue_invite() as that admin
--      (DB re-checks permissions), then auth.admin.inviteUserByEmail().
--      GoTrue inserts into auth.users → gate passes → link trigger sets
--      employees.user_id.
--   3. The invitee follows the link; GoTrue sets email_confirmed_at →
--      activation trigger sets status 'active' and accepted_at.
--
-- Roles
--   app_role = admin | finance | compliance (granted, effective-dated by
--   revoked_at). "Leader" is derived from the hierarchy (r1/p1/hierarchy).
--   Every admin write requires role admin AND aal2 (MFA).
--   The last active admin cannot be removed.
--   First admin: app_private.bootstrap_admin('email') from the SQL editor.
--
-- Policy helpers live in app_private. RLS expressions run with the caller's
-- privileges, so authenticated gets USAGE on app_private and EXECUTE on the
-- policy helpers only. app_private is not an exposed API schema, so this does
-- not make anything callable over REST.
-- ============================================================

-- ------------------------------------------------------------
-- Types and tables
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'finance', 'compliance');
  END IF;
END
$$;

CREATE SEQUENCE IF NOT EXISTS public.employee_no_seq START 1;

CREATE TABLE IF NOT EXISTS public.employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL,
  employee_no     text NOT NULL UNIQUE
                    DEFAULT 'P' || lpad(nextval('public.employee_no_seq')::text, 5, '0')
                    CHECK (employee_no ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  first_name      text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 100),
  last_name       text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 100),
  email           text NOT NULL UNIQUE
                    CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone           text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  start_date      date NOT NULL CHECK (start_date >= DATE '2000-01-01'),
  status          text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'inactive')),
  employment_type text NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time')),
  timezone        text NOT NULL DEFAULT 'Europe/Berlin',
  deactivated_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT employees_inactive_has_date CHECK ((status = 'inactive') = (deactivated_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees (status);
CREATE INDEX IF NOT EXISTS idx_employees_name ON public.employees (last_name, first_name);

CREATE TABLE IF NOT EXISTS public.employee_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  email       text NOT NULL CHECK (email = lower(email)),
  invited_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  linked_at   timestamptz,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  CHECK (expires_at > created_at)
);

-- One open invite per email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_invites_open
  ON public.employee_invites (email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_active
  ON public.user_roles (user_id, role) WHERE revoked_at IS NULL;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION app_private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS employees_touch ON public.employees;
CREATE TRIGGER employees_touch BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

SELECT app_private.attach_audit('public.employees');
SELECT app_private.attach_audit('public.employee_invites');
SELECT app_private.attach_audit('public.user_roles');

-- ------------------------------------------------------------
-- Policy helpers (EXECUTE for authenticated; see header)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id FROM public.employees e
   WHERE e.user_id = auth.uid() AND e.status = 'active'
$$;

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
$$;

CREATE OR REPLACE FUNCTION app_private.is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Visibility of an employee record. r1/p1/hierarchy extends this with
-- "target is in my structure".
CREATE OR REPLACE FUNCTION app_private.can_see_employee(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_target = app_private.current_employee_id()
      OR app_private.has_role('admin')
      OR app_private.has_role('finance')
      OR app_private.has_role('compliance')
$$;

GRANT USAGE ON SCHEMA app_private TO authenticated;
-- Functions created later in app_private are not executable by default;
-- each slice grants exactly the policy helpers it adds.
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_employee_id(),
                          app_private.has_role(public.app_role),
                          app_private.is_aal2(),
                          app_private.can_see_employee(uuid)
  TO authenticated;

-- Raises unless the caller is an admin with MFA. Used by every admin RPC.
CREATE OR REPLACE FUNCTION app_private.assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT app_private.has_role('admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT app_private.is_aal2() THEN
    RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- RLS: read through policies, write only through RPCs
-- ------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (app_private.can_see_employee(id));

DROP POLICY IF EXISTS employee_invites_select ON public.employee_invites;
CREATE POLICY employee_invites_select ON public.employee_invites
  FOR SELECT TO authenticated
  USING (app_private.has_role('admin'));

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.has_role('admin'));

REVOKE ALL ON public.employees, public.employee_invites, public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employees, public.employee_invites, public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees, public.employee_invites, public.user_roles TO service_role;
REVOKE ALL ON SEQUENCE public.employee_no_seq FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Signup gate: replaces the allowlist (kept as a deprecated table)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS enforce_signup_allowlist_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_signup_allowlist();
COMMENT ON TABLE public.signup_allowlist IS
  'DEPRECATED since 20261026150000: signups are gated by public.employee_invites. Kept for history only.';

CREATE OR REPLACE FUNCTION app_private.enforce_employee_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employee_invites i
     WHERE i.email = lower(btrim(coalesce(NEW.email, '')))
       AND i.accepted_at IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > now()
  ) THEN
    -- Same wording for "not invited", "expired" and "malformed": the error
    -- must not tell an anonymous caller which addresses are invited.
    RAISE EXCEPTION 'Registrierung ist derzeit nur für freigegebene E-Mail-Adressen möglich.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_employee_invite_trigger ON auth.users;
CREATE TRIGGER enforce_employee_invite_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_employee_invite();

-- Link the new auth user to the invited employee.
CREATE OR REPLACE FUNCTION app_private.link_invited_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.employees e
     SET user_id = NEW.id
   WHERE e.email = lower(btrim(NEW.email))
     AND e.user_id IS NULL;

  UPDATE public.employee_invites i
     SET linked_at = now()
   WHERE i.email = lower(btrim(NEW.email))
     AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.linked_at IS NULL;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS link_invited_user_trigger ON auth.users;
CREATE TRIGGER link_invited_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.link_invited_user();

-- Activate once the invite link is used (GoTrue confirms the email).
CREATE OR REPLACE FUNCTION app_private.activate_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.employees e
       SET status = 'active'
     WHERE e.user_id = NEW.id AND e.status = 'invited';

    UPDATE public.employee_invites i
       SET accepted_at = now()
     WHERE i.email = lower(btrim(NEW.email))
       AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS activate_on_confirm_trigger ON auth.users;
CREATE TRIGGER activate_on_confirm_trigger
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.activate_on_confirm();

-- Keep the work email in sync if the auth email is changed.
CREATE OR REPLACE FUNCTION app_private.sync_employee_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(NEW.email) IS DISTINCT FROM lower(OLD.email) AND NEW.email IS NOT NULL THEN
    PERFORM set_config('app.reason', 'E-Mail-Adresse im Login geändert', true);
    UPDATE public.employees e SET email = lower(btrim(NEW.email)) WHERE e.user_id = NEW.id;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS sync_employee_email_trigger ON auth.users;
CREATE TRIGGER sync_employee_email_trigger
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_employee_email();

REVOKE EXECUTE ON FUNCTION app_private.enforce_employee_invite(), app_private.link_invited_user(),
  app_private.activate_on_confirm(), app_private.sync_employee_email(), app_private.assert_admin(),
  app_private.touch_updated_at()
  FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Admin RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_employee(
  p_first_name      text,
  p_last_name       text,
  p_email           text,
  p_start_date      date,
  p_employment_type text DEFAULT 'full_time',
  p_phone           text DEFAULT NULL,
  p_employee_no     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_emp     public.employees%ROWTYPE;
BEGIN
  PERFORM app_private.assert_admin();

  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.email = v_email) THEN
    RAISE EXCEPTION 'employee_exists' USING ERRCODE = '23505';
  END IF;

  SELECT u.id INTO v_user_id FROM auth.users u WHERE lower(u.email) = v_email;
  IF v_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = v_user_id) THEN
    RAISE EXCEPTION 'employee_exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.employees
    (first_name, last_name, email, start_date, employment_type, phone, employee_no, user_id, status, created_by)
  VALUES
    (btrim(p_first_name), btrim(p_last_name), v_email, p_start_date, p_employment_type,
     nullif(btrim(coalesce(p_phone, '')), ''),
     coalesce(nullif(upper(btrim(coalesce(p_employee_no, ''))), ''),
              'P' || lpad(nextval('public.employee_no_seq')::text, 5, '0')),
     v_user_id,
     CASE WHEN v_user_id IS NULL THEN 'invited' ELSE 'active' END,
     auth.uid())
  RETURNING * INTO v_emp;

  IF v_user_id IS NULL THEN
    INSERT INTO public.employee_invites (employee_id, email, invited_by, expires_at)
    VALUES (v_emp.id, v_email, auth.uid(), now() + interval '7 days');
  END IF;

  RETURN jsonb_build_object(
    'employee_id', v_emp.id,
    'employee_no', v_emp.employee_no,
    'status', v_emp.status,
    'needs_invite', v_user_id IS NULL);
END
$$;

-- Re-issues the invite (revoking any open one). Returns the email for the
-- Edge Function to send. Only for employees without a linked account.
CREATE OR REPLACE FUNCTION public.rpc_issue_invite(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
BEGIN
  PERFORM app_private.assert_admin();

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_emp.user_id IS NOT NULL THEN RAISE EXCEPTION 'already_linked' USING ERRCODE = 'P0001'; END IF;
  IF v_emp.status <> 'invited' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.employee_invites
     SET revoked_at = now()
   WHERE employee_id = p_employee_id AND accepted_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.employee_invites (employee_id, email, invited_by, expires_at)
  VALUES (v_emp.id, v_emp.email, auth.uid(), now() + interval '7 days');

  PERFORM app_private.log_event('employee.invite_issued', 'public.employees', v_emp.id::text,
                                jsonb_build_object('email', v_emp.email));
  RETURN jsonb_build_object('employee_id', v_emp.id, 'email', v_emp.email);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_invite(p_employee_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  UPDATE public.employee_invites
     SET revoked_at = now()
   WHERE employee_id = p_employee_id AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_open_invite' USING ERRCODE = 'P0001'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_employee(
  p_employee_id     uuid,
  p_first_name      text,
  p_last_name       text,
  p_phone           text,
  p_start_date      date,
  p_employment_type text,
  p_reason          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  UPDATE public.employees
     SET first_name = btrim(p_first_name),
         last_name = btrim(p_last_name),
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         start_date = p_start_date,
         employment_type = p_employment_type
   WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_employee_active(
  p_employee_id uuid,
  p_active      boolean,
  p_reason      text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
  v_new text;
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_emp.user_id = auth.uid() AND NOT p_active THEN
    RAISE EXCEPTION 'cannot_deactivate_self' USING ERRCODE = 'P0001';
  END IF;

  IF p_active THEN
    -- Back to 'invited' when no account was ever linked.
    v_new := CASE WHEN v_emp.user_id IS NULL THEN 'invited' ELSE 'active' END;
    UPDATE public.employees SET status = v_new, deactivated_at = NULL WHERE id = p_employee_id;
  ELSE
    v_new := 'inactive';
    UPDATE public.employees SET status = 'inactive', deactivated_at = now() WHERE id = p_employee_id;
    UPDATE public.employee_invites
       SET revoked_at = now()
     WHERE employee_id = p_employee_id AND accepted_at IS NULL AND revoked_at IS NULL;
  END IF;
  RETURN v_new;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_grant_role(p_user_id uuid, p_role public.app_role, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (p_user_id, p_role, auth.uid())
  ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_role(p_user_id uuid, p_role public.app_role, p_reason text)
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

  IF p_role = 'admin' AND (
    SELECT count(*) FROM public.user_roles r
     WHERE r.role = 'admin' AND r.revoked_at IS NULL AND r.user_id <> p_user_id
  ) = 0 THEN
    RAISE EXCEPTION 'last_admin' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_roles
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE user_id = p_user_id AND role = p_role AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
END
$$;

-- ------------------------------------------------------------
-- Audit read access
-- ------------------------------------------------------------
-- Extended by later slices (hierarchy, production, …) with their entity types.
CREATE OR REPLACE FUNCTION app_private.can_read_audit(p_entity_type text, p_entity_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.has_role('admin') OR app_private.has_role('compliance') THEN
    RETURN true;
  END IF;
  IF p_entity_type = 'public.employees' THEN
    RETURN p_entity_id::uuid = app_private.current_employee_id();
  END IF;
  RETURN false;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_audit_for(p_entity_type text, p_entity_id text)
RETURNS TABLE (
  id          bigint,
  at          timestamptz,
  actor_id    uuid,
  actor_name  text,
  actor_kind  text,
  action      text,
  reason      text,
  old_values  jsonb,
  new_values  jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app_private.can_read_audit(p_entity_type, p_entity_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT ev.id, ev.at, ev.actor_id,
           coalesce(e.first_name || ' ' || e.last_name, CASE WHEN ev.actor_id IS NULL THEN NULL ELSE 'Unbekannt' END),
           ev.actor_kind, ev.action, ev.reason, ev.old_values, ev.new_values
      FROM audit.events ev
      LEFT JOIN public.employees e ON e.user_id = ev.actor_id
     WHERE ev.entity_type = p_entity_type AND ev.entity_id = p_entity_id
     ORDER BY ev.at DESC, ev.id DESC
     LIMIT 200;
END
$$;

-- ------------------------------------------------------------
-- rpc_my_context: now with employee and roles (same JSON shape)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_my_context()
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
                    'status', e.status, 'level_code', NULL)
                   FROM public.employees e WHERE e.user_id = auth.uid()),
    'roles',    coalesce((SELECT jsonb_agg(r.role ORDER BY r.role)
                            FROM public.user_roles r
                           WHERE r.user_id = auth.uid() AND r.revoked_at IS NULL), '[]'::jsonb),
    'descendant_count', 0,
    'feature_flags', coalesce(
                       (SELECT s.value FROM public.app_settings s WHERE s.key = 'feature_flags'),
                       '{}'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL
$$;

-- ------------------------------------------------------------
-- Bootstrap: first admin, from the SQL editor only (no API grants)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.bootstrap_admin(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'admin_exists' USING ERRCODE = 'P0001',
      HINT = 'Use rpc_grant_role as an existing admin instead.';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM set_config('app.reason', 'Erster Administrator (Bootstrap)', true);
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin');
  RETURN v_user;
END
$$;

-- ------------------------------------------------------------
-- Grants for the RPCs
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_create_employee(text, text, text, date, text, text, text),
  public.rpc_issue_invite(uuid),
  public.rpc_revoke_invite(uuid, text),
  public.rpc_update_employee(uuid, text, text, text, date, text, text),
  public.rpc_set_employee_active(uuid, boolean, text),
  public.rpc_grant_role(uuid, public.app_role, text),
  public.rpc_revoke_role(uuid, public.app_role, text),
  public.rpc_audit_for(text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.rpc_create_employee(text, text, text, date, text, text, text),
  public.rpc_issue_invite(uuid),
  public.rpc_revoke_invite(uuid, text),
  public.rpc_update_employee(uuid, text, text, text, date, text, text),
  public.rpc_set_employee_active(uuid, boolean, text),
  public.rpc_grant_role(uuid, public.app_role, text),
  public.rpc_revoke_role(uuid, public.app_role, text),
  public.rpc_audit_for(text, text)
TO authenticated;

REVOKE EXECUTE ON FUNCTION app_private.bootstrap_admin(text), app_private.can_read_audit(text, text)
  FROM PUBLIC, anon, authenticated;
