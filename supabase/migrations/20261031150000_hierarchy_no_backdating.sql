-- ============================================================
-- Hierarchy: no retroactive changes; cancelled moves stay visible
-- ============================================================
-- 1. rpc_assign_manager refused only dates before the *start* of the current
--    assignment. A date between that start and today was accepted (the
--    current line was split in the past), and a date equal to its start
--    rewrote the line in place. Both silently moved past production to
--    another structure (career credits, §14.3), although the form says
--    earlier dates are refused.
--    Now, once someone has a current assignment, a change must take effect
--    today or later (`retroactive_change`). A same-day correction of a line
--    that started today stays possible. A person's *first* assignment may
--    still start in the past (from their start date), e.g. when onboarding.
--
-- 2. Cancelling a planned move deletes its row (the structure must not
--    contain it), so it vanished from the history. The audit log keeps the
--    deleted row with who, when and why; rpc_cancelled_assignments shows it
--    to admins next to the history.
-- ============================================================

CREATE OR REPLACE FUNCTION app_rpc.rpc_assign_manager(
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
    -- Changing an existing reporting line in the past would re-attribute
    -- production that was already credited to the old structure.
    IF p_effective_from < app_private.business_today() THEN
      RAISE EXCEPTION 'retroactive_change' USING ERRCODE = 'P0001';
    END IF;
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

-- Planned moves an admin cancelled (newest first), from the audit log.
-- Cancelling is the only way an assignment row is ever deleted.
CREATE OR REPLACE FUNCTION app_rpc.rpc_cancelled_assignments(p_employee_id uuid)
RETURNS TABLE (
  assignment_id  uuid,
  manager_id     uuid,
  effective_from date,
  change_reason  text,
  cancelled_at   timestamptz,
  cancelled_by   text,
  cancel_reason  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app_private.has_role('admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT (ev.old_values ->> 'id')::uuid,
           (ev.old_values ->> 'manager_id')::uuid,
           (ev.old_values ->> 'effective_from')::date,
           ev.old_values ->> 'change_reason',
           ev.at,
           coalesce(actor.first_name || ' ' || actor.last_name, 'System'),
           ev.reason
      FROM audit.events ev
      LEFT JOIN public.employees actor ON actor.user_id = ev.actor_id
     WHERE ev.entity_type = 'public.hierarchy_assignments'
       AND ev.action = 'delete'
       AND ev.old_values ->> 'employee_id' = p_employee_id::text
     ORDER BY ev.at DESC;
END
$$;

SELECT app_private.publish_rpc('app_rpc.rpc_cancelled_assignments(uuid)'::regprocedure);
