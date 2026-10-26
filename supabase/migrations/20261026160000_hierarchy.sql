-- ============================================================
-- r1/p1/hierarchy: effective-dated reporting lines (spec §5.1)
-- ============================================================
-- One row per (employee, period) in hierarchy_assignments. manager_id NULL
-- means "top of a structure" (e.g. the VD, or an approved exception).
-- Ranges per employee never overlap (exclusion constraint) and the
-- structure never contains a cycle at any date (trigger).
--
-- Visibility
--   app_private.visible_employee_ids() = self + all descendants as of today
--   (Europe/Berlin), or everyone for admin/finance/compliance. Policies use
--   it as `col IN (SELECT app_private.visible_employee_ids())`, which Postgres
--   evaluates once per statement. There is deliberately no stored closure
--   table: a future-dated transfer takes effect at midnight without any
--   write, and a stored closure would be stale until something rebuilt it.
--
-- History
--   app_private.ancestors_at(employee, date) returns the reporting chain on
--   a given date. Production attribution and commissions (Phase 2) use it
--   with the production date, so a later transfer never rewrites the past
--   (§5.1, §14.3).
--
-- Changes go through rpc_assign_manager (admin + MFA + reason). It closes
-- the open assignment and opens the new one. Assignments that start in the
-- future must be removed before another change is made, and changes can't be
-- dated before the current assignment's start (no silent rewriting of history).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.hierarchy_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  manager_id     uuid REFERENCES public.employees (id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to   date,
  change_reason  text,
  approved_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hierarchy_not_self CHECK (manager_id IS DISTINCT FROM employee_id),
  CONSTRAINT hierarchy_range_valid CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT hierarchy_no_overlap EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_hierarchy_manager ON public.hierarchy_assignments (manager_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_hierarchy_employee ON public.hierarchy_assignments (employee_id, effective_from);

SELECT app_private.attach_audit('public.hierarchy_assignments');

-- ------------------------------------------------------------
-- Time and traversal helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.business_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'Europe/Berlin')::date
$$;

-- Reporting chain of an employee on a date: depth 1 = direct manager.
CREATE OR REPLACE FUNCTION app_private.ancestors_at(p_employee uuid, p_date date)
RETURNS TABLE (ancestor_id uuid, depth integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE chain (employee_id, depth, path) AS (
    SELECT a.manager_id, 1, ARRAY[p_employee, a.manager_id]
      FROM public.hierarchy_assignments a
     WHERE a.employee_id = p_employee
       AND a.effective_from <= p_date
       AND (a.effective_to IS NULL OR a.effective_to > p_date)
       AND a.manager_id IS NOT NULL
    UNION ALL
    SELECT a.manager_id, c.depth + 1, c.path || a.manager_id
      FROM chain c
      JOIN public.hierarchy_assignments a
        ON a.employee_id = c.employee_id
       AND a.effective_from <= p_date
       AND (a.effective_to IS NULL OR a.effective_to > p_date)
     WHERE a.manager_id IS NOT NULL
       AND NOT a.manager_id = ANY (c.path) -- defensive: never loop on bad data
  )
  SELECT employee_id, depth FROM chain ORDER BY depth
$$;

-- All descendants of an employee on a date (depth 1 = direct reports).
CREATE OR REPLACE FUNCTION app_private.descendants_at(p_employee uuid, p_date date)
RETURNS TABLE (descendant_id uuid, depth integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH RECURSIVE tree (employee_id, depth, path) AS (
    SELECT a.employee_id, 1, ARRAY[p_employee, a.employee_id]
      FROM public.hierarchy_assignments a
     WHERE a.manager_id = p_employee
       AND a.effective_from <= p_date
       AND (a.effective_to IS NULL OR a.effective_to > p_date)
    UNION ALL
    SELECT a.employee_id, t.depth + 1, t.path || a.employee_id
      FROM tree t
      JOIN public.hierarchy_assignments a
        ON a.manager_id = t.employee_id
       AND a.effective_from <= p_date
       AND (a.effective_to IS NULL OR a.effective_to > p_date)
     WHERE NOT a.employee_id = ANY (t.path)
  )
  SELECT employee_id, depth FROM tree
$$;

-- Everyone the caller may see today.
CREATE OR REPLACE FUNCTION app_private.visible_employee_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := app_private.current_employee_id();
BEGIN
  IF app_private.has_role('admin') OR app_private.has_role('finance') OR app_private.has_role('compliance') THEN
    RETURN QUERY SELECT e.id FROM public.employees e;
    RETURN;
  END IF;
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  RETURN NEXT v_me;
  RETURN QUERY SELECT d.descendant_id FROM app_private.descendants_at(v_me, app_private.business_today()) d;
END
$$;

-- Single-record check, now including the caller's structure.
CREATE OR REPLACE FUNCTION app_private.can_see_employee(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_target IN (SELECT app_private.visible_employee_ids())
$$;

GRANT EXECUTE ON FUNCTION app_private.visible_employee_ids(), app_private.business_today() TO authenticated;

-- employees: replace the per-row function policy with the set-based one.
DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (id IN (SELECT app_private.visible_employee_ids()));

-- ------------------------------------------------------------
-- Cycle prevention
-- ------------------------------------------------------------
-- The structure is piecewise constant between assignment boundaries, so a
-- cycle can only start at one of those dates. Check the new assignment's
-- start and every boundary inside its range.
CREATE OR REPLACE FUNCTION app_private.prevent_hierarchy_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;
  FOR v_day IN
    SELECT NEW.effective_from
    UNION
    SELECT d FROM (
      SELECT a.effective_from AS d FROM public.hierarchy_assignments a
      UNION
      SELECT a.effective_to FROM public.hierarchy_assignments a WHERE a.effective_to IS NOT NULL
    ) b
    WHERE d > NEW.effective_from AND (NEW.effective_to IS NULL OR d < NEW.effective_to)
  LOOP
    IF NEW.manager_id = NEW.employee_id
       OR NEW.employee_id IN (SELECT x.ancestor_id FROM app_private.ancestors_at(NEW.manager_id, v_day) x) THEN
      RAISE EXCEPTION 'hierarchy_cycle'
        USING ERRCODE = 'P0001', DETAIL = format('cycle on %s', v_day);
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS hierarchy_no_cycle ON public.hierarchy_assignments;
CREATE TRIGGER hierarchy_no_cycle
  BEFORE INSERT OR UPDATE ON public.hierarchy_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_hierarchy_cycle();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.hierarchy_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hierarchy_select ON public.hierarchy_assignments;
CREATE POLICY hierarchy_select ON public.hierarchy_assignments
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT app_private.visible_employee_ids()));

REVOKE ALL ON public.hierarchy_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hierarchy_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hierarchy_assignments TO service_role;

-- Current reporting line for every visible employee (RLS of the caller applies).
CREATE OR REPLACE VIEW public.v_current_hierarchy
WITH (security_invoker = true) AS
SELECT e.id AS employee_id,
       e.first_name,
       e.last_name,
       e.employee_no,
       e.status,
       a.manager_id,
       a.effective_from
  FROM public.employees e
  LEFT JOIN public.hierarchy_assignments a
    ON a.employee_id = e.id
   AND a.effective_from <= app_private.business_today()
   AND (a.effective_to IS NULL OR a.effective_to > app_private.business_today());

REVOKE ALL ON public.v_current_hierarchy FROM PUBLIC, anon;
GRANT SELECT ON public.v_current_hierarchy TO authenticated;

-- ------------------------------------------------------------
-- Write RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_assign_manager(
  p_employee_id    uuid,
  p_manager_id     uuid,
  p_effective_from date,
  p_reason         text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason  text;
  v_emp     public.employees%ROWTYPE;
  v_current public.hierarchy_assignments%ROWTYPE;
  v_new_id  uuid;
  v_later_from date;
BEGIN
  PERFORM app_private.assert_admin();
  v_reason := app_private.require_reason(p_reason);

  -- One structural change at a time.
  PERFORM pg_advisory_xact_lock(hashtext('hierarchy_assignments'));

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'date_required' USING ERRCODE = '22023'; END IF;
  IF p_effective_from < v_emp.start_date THEN
    RAISE EXCEPTION 'before_start_date' USING ERRCODE = 'P0001';
  END IF;

  IF p_manager_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees m WHERE m.id = p_manager_id AND m.status <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'manager_inactive' USING ERRCODE = 'P0001';
  END IF;

  -- A later assignment either hasn't started yet (a planned transfer: cancel
  -- it first) or is already in effect (the change would rewrite history).
  SELECT max(a.effective_from) INTO v_later_from
    FROM public.hierarchy_assignments a
   WHERE a.employee_id = p_employee_id AND a.effective_from > p_effective_from;
  IF v_later_from IS NOT NULL THEN
    IF v_later_from > app_private.business_today() THEN
      RAISE EXCEPTION 'future_assignment_exists' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'before_current_assignment' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_current FROM public.hierarchy_assignments a
   WHERE a.employee_id = p_employee_id AND a.effective_to IS NULL
   FOR UPDATE;

  IF FOUND THEN
    IF v_current.manager_id IS NOT DISTINCT FROM p_manager_id THEN
      RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001';
    END IF;
    IF p_effective_from = v_current.effective_from THEN
      -- Same day: correct the assignment instead of creating a zero-length one.
      UPDATE public.hierarchy_assignments
         SET manager_id = p_manager_id, change_reason = v_reason, approved_by = auth.uid()
       WHERE id = v_current.id
      RETURNING id INTO v_new_id;
      RETURN v_new_id;
    END IF;
    UPDATE public.hierarchy_assignments SET effective_to = p_effective_from WHERE id = v_current.id;
  END IF;

  INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, change_reason, approved_by)
  VALUES (p_employee_id, p_manager_id, p_effective_from, v_reason, auth.uid())
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END
$$;

-- Removes an assignment that hasn't started yet (planned transfer called off)
-- and reopens the previous one.
CREATE OR REPLACE FUNCTION public.rpc_cancel_future_assignment(p_assignment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.hierarchy_assignments%ROWTYPE;
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  PERFORM pg_advisory_xact_lock(hashtext('hierarchy_assignments'));

  SELECT * INTO v_row FROM public.hierarchy_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.effective_from <= app_private.business_today() THEN
    RAISE EXCEPTION 'already_effective' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'not_latest' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.hierarchy_assignments WHERE id = p_assignment_id;
  UPDATE public.hierarchy_assignments
     SET effective_to = NULL
   WHERE employee_id = v_row.employee_id AND effective_to = v_row.effective_from;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_assign_manager(uuid, uuid, date, text),
                           public.rpc_cancel_future_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_manager(uuid, uuid, date, text),
                          public.rpc_cancel_future_assignment(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- Context: descendant count (makes the user a "leader")
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
    'descendant_count', coalesce((
                    SELECT count(*)::int FROM app_private.descendants_at(
                      app_private.current_employee_id(), app_private.business_today())), 0),
    'feature_flags', coalesce(
                       (SELECT s.value FROM public.app_settings s WHERE s.key = 'feature_flags'),
                       '{}'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL
$$;
