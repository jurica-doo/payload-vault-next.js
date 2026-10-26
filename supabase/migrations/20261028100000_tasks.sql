-- ============================================================
-- r1/p4/task-engine: shared tasks and notifications (spec §11)
-- ============================================================
-- One task engine for every module instead of a reminder feature per screen.
--
-- tasks           owner, type, link to the record that caused it, due date,
--                 priority, status. System tasks are idempotent: at most one
--                 OPEN task per (type, linked record, owner).
-- notifications   in-app messages per employee; `critical` ones can't be
--                 muted (§11.3). E-mail delivery is Phase 6.
-- notification_preferences  muted non-critical kinds per employee.
--
-- app_private.run_task_generators() creates/closes system tasks:
--   goal_review          submitted goal → nearest active manager
--   coaching_action      overdue open coaching action → its owner
--   coaching_review      next coaching review within 7 days → the leader
--   career_period_end    period ends within 30 days and not qualified
--                         → employee (+ notification to the direct manager)
--   calculation_exception open exception → every finance user (critical)
--   reassignment         open tasks of inactive owners → nearest active manager
-- Tasks whose cause is gone are closed automatically ("cancelled" with a
-- note). Lead generators are added by r1/p4/leads.
-- Scheduling: pg_cron every 15 minutes when the extension is enabled
-- (app_private.schedule_jobs(), idempotent); admins can also run it on demand.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  created_by      uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system')),
  type            text NOT NULL DEFAULT 'manual' CHECK (type IN (
                    'manual', 'goal_review', 'coaching_action', 'coaching_review', 'career_period_end',
                    'calculation_exception', 'lead_first_contact', 'lead_next_action', 'lead_unassigned',
                    'customer_service', 'subsidy_review')),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  description     text CHECK (description IS NULL OR length(description) <= 4000),
  linked_type     text,
  linked_id       uuid,
  due_at          timestamptz,
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  completed_at    timestamptz,
  completion_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_completed CHECK ((status = 'open') = (completed_at IS NULL)),
  CONSTRAINT tasks_link_pair CHECK ((linked_type IS NULL) = (linked_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_system_open
  ON public.tasks (type, linked_type, linked_id, owner_id) WHERE status = 'open' AND source = 'system';
CREATE INDEX IF NOT EXISTS idx_tasks_owner_open ON public.tasks (owner_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  body         text,
  link         text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_\-?=&%.]*$'),
  critical     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications (recipient_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  employee_id uuid PRIMARY KEY REFERENCES public.employees (id) ON DELETE CASCADE,
  muted_kinds text[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tasks_touch ON public.tasks;
CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.tasks');

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
-- Kinds that can never be muted (§11.3).
CREATE OR REPLACE FUNCTION app_private.critical_kinds()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT ARRAY['calculation_exception', 'goal_review', 'reassignment'] $$;

CREATE OR REPLACE FUNCTION app_private.notify(
  p_recipient uuid, p_kind text, p_title text, p_body text DEFAULT NULL, p_link text DEFAULT NULL, p_critical boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_critical boolean := p_critical OR p_kind = ANY (app_private.critical_kinds());
BEGIN
  IF NOT v_critical AND EXISTS (
    SELECT 1 FROM public.notification_preferences np WHERE np.employee_id = p_recipient AND p_kind = ANY (np.muted_kinds)
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical)
  VALUES (p_recipient, p_kind, p_title, p_body, p_link, v_critical);
END
$$;

-- Idempotent system task: returns the id of the open task (new or existing).
CREATE OR REPLACE FUNCTION app_private.ensure_system_task(
  p_type text, p_owner uuid, p_title text, p_due timestamptz, p_linked_type text, p_linked_id uuid,
  p_priority text DEFAULT 'normal', p_link text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tasks
   WHERE type = p_type AND linked_type = p_linked_type AND linked_id = p_linked_id AND owner_id = p_owner
     AND status = 'open' AND source = 'system';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority)
  VALUES (p_owner, 'system', p_type, p_title, p_linked_type, p_linked_id, p_due, p_priority)
  RETURNING id INTO v_id;
  PERFORM app_private.notify(p_owner, p_type, p_title, NULL, p_link);
  RETURN v_id;
END
$$;

-- Closes open system tasks of a type whose linked record no longer needs them.
CREATE OR REPLACE FUNCTION app_private.close_system_tasks(p_type text, p_keep_ids uuid[], p_note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.tasks
     SET status = 'cancelled', completed_at = now(), completion_note = p_note
   WHERE type = p_type AND source = 'system' AND status = 'open'
     AND NOT (id = ANY (coalesce(p_keep_ids, '{}')));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

-- Nearest active manager today (or NULL).
CREATE OR REPLACE FUNCTION app_private.active_manager_of(p_employee uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.ancestor_id FROM app_private.ancestors_at(p_employee, app_private.business_today()) a
    JOIN public.employees e ON e.id = a.ancestor_id AND e.status = 'active'
   ORDER BY a.depth LIMIT 1
$$;

-- ------------------------------------------------------------
-- Generators
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := app_private.business_today();
  v_keep  uuid[];
  v_id    uuid;
  r       record;
  q       jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_mgr   uuid;
BEGIN
  PERFORM app_private.set_audit_context('Automatische Aufgabenerstellung');

  -- reassignment: open tasks of inactive owners move to the nearest active manager
  FOR r IN SELECT t.id, t.owner_id FROM public.tasks t JOIN public.employees e ON e.id = t.owner_id
            WHERE t.status = 'open' AND e.status = 'inactive' LOOP
    v_mgr := app_private.active_manager_of(r.owner_id);
    IF v_mgr IS NOT NULL THEN
      UPDATE public.tasks SET owner_id = v_mgr WHERE id = r.id
        AND NOT EXISTS (SELECT 1 FROM public.tasks x WHERE x.status = 'open' AND x.source = 'system'
                          AND x.type = tasks.type AND x.linked_id = tasks.linked_id AND x.owner_id = v_mgr);
      PERFORM app_private.notify(v_mgr, 'reassignment', 'Aufgabe übernommen', 'Die zuständige Person ist inaktiv.', '/vertrieb/aufgaben');
    END IF;
  END LOOP;

  -- goal_review
  v_keep := '{}';
  FOR r IN SELECT g.id, g.employee_id, e.first_name || ' ' || e.last_name AS name
             FROM public.monthly_goals g JOIN public.employees e ON e.id = g.employee_id
            WHERE g.status = 'submitted' LOOP
    v_mgr := app_private.active_manager_of(r.employee_id);
    CONTINUE WHEN v_mgr IS NULL;
    v_id := app_private.ensure_system_task('goal_review', v_mgr, 'Ziel prüfen: ' || r.name,
              (v_today + 3)::timestamptz, 'monthly_goal', r.id, 'normal', '/vertrieb/ziele');
    v_keep := v_keep || v_id;
  END LOOP;
  v_stats := v_stats || jsonb_build_object('goal_review_closed', app_private.close_system_tasks('goal_review', v_keep, 'Ziel wurde bearbeitet'));

  -- coaching_action (overdue)
  v_keep := '{}';
  FOR r IN SELECT a.id, a.owner_id, a.title, a.due_on FROM public.coaching_actions a
            WHERE a.status = 'open' AND a.due_on < v_today LOOP
    v_id := app_private.ensure_system_task('coaching_action', r.owner_id, 'Überfällige Maßnahme: ' || r.title,
              r.due_on::timestamptz, 'coaching_action', r.id, 'high', '/vertrieb');
    v_keep := v_keep || v_id;
  END LOOP;
  PERFORM app_private.close_system_tasks('coaching_action', v_keep, 'Maßnahme erledigt oder abgebrochen');

  -- coaching_review (within 7 days)
  v_keep := '{}';
  FOR r IN SELECT DISTINCT ON (s.employee_id) s.employee_id, s.leader_id, s.next_review_on, e.first_name || ' ' || e.last_name AS name
             FROM public.coaching_sessions s JOIN public.employees e ON e.id = s.employee_id
            WHERE s.next_review_on BETWEEN v_today AND v_today + 7
            ORDER BY s.employee_id, s.next_review_on LOOP
    v_id := app_private.ensure_system_task('coaching_review', r.leader_id, 'Coaching-Gespräch mit ' || r.name,
              r.next_review_on::timestamptz, 'employee', r.employee_id, 'normal', '/vertrieb/team/' || r.employee_id);
    v_keep := v_keep || v_id;
  END LOOP;
  PERFORM app_private.close_system_tasks('coaching_review', v_keep, 'Termin liegt nicht mehr im Zeitfenster');

  -- career_period_end (≤ 30 days, not qualified)
  v_keep := '{}';
  FOR r IN SELECT e.id, e.first_name || ' ' || e.last_name AS name FROM public.employees e WHERE e.status = 'active' LOOP
    PERFORM app_private.generate_periods(r.id);
    q := app_private.compute_qualification(r.id, v_today);
    IF q ->> 'status' = 'in_progress' AND (q -> 'period' ->> 'end')::date <= v_today + 30 THEN
      v_id := app_private.ensure_system_task('career_period_end', r.id,
                format('Karrierezeitraum endet am %s: noch %s P / %s KV-P bis %s',
                       to_char((q -> 'period' ->> 'end')::date - 1, 'DD.MM.YYYY'),
                       trim_scale((q ->> 'points_missing')::numeric), trim_scale((q ->> 'kv_missing')::numeric), q ->> 'target'),
                ((q -> 'period' ->> 'end')::date - 1)::timestamptz, 'employee', r.id, 'high', '/vertrieb/karriere');
      v_keep := v_keep || v_id;
      v_mgr := app_private.active_manager_of(r.id);
      IF v_mgr IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.notifications n WHERE n.recipient_id = v_mgr AND n.kind = 'career_period_end'
           AND n.link = '/vertrieb/team/' || r.id AND n.created_at > now() - interval '7 days') THEN
        PERFORM app_private.notify(v_mgr, 'career_period_end', 'Karrierezeitraum endet bald: ' || r.name, NULL, '/vertrieb/team/' || r.id);
      END IF;
    END IF;
  END LOOP;
  PERFORM app_private.close_system_tasks('career_period_end', v_keep, 'Qualifiziert oder Zeitraum gewechselt');

  -- calculation_exception → every active finance user
  v_keep := '{}';
  FOR r IN SELECT x.id, x.reason_code, f.id AS finance_id
             FROM public.exception_queue x
             CROSS JOIN (SELECT e.id FROM public.employees e JOIN public.user_roles ur
                           ON ur.user_id = e.user_id AND ur.role = 'finance' AND ur.revoked_at IS NULL
                          WHERE e.status = 'active') f
            WHERE x.status = 'open' LOOP
    v_id := app_private.ensure_system_task('calculation_exception', r.finance_id, 'Prüffall: ' || r.reason_code,
              now(), 'exception', r.id, 'high', '/vertrieb/provisionen/abrechnung');
    v_keep := v_keep || v_id;
  END LOOP;
  PERFORM app_private.close_system_tasks('calculation_exception', v_keep, 'Prüffall erledigt');

  RETURN v_stats || jsonb_build_object('open_system_tasks', (SELECT count(*) FROM public.tasks WHERE source = 'system' AND status = 'open'));
END
$$;

-- Schedules the generators with pg_cron if available (idempotent).
CREATE OR REPLACE FUNCTION app_private.schedule_jobs()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RETURN 'pg_cron not enabled';
  END IF;
  EXECUTE $q$SELECT cron.schedule('r1-task-generators', '*/15 * * * *', 'SELECT app_private.run_task_generators()')$q$;
  RETURN 'scheduled';
EXCEPTION WHEN OTHERS THEN
  RETURN 'not scheduled: ' || SQLERRM;
END
$$;

DO $$ BEGIN RAISE NOTICE 'task generators: %', app_private.schedule_jobs(); END $$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
  USING (owner_id = app_private.current_employee_id() OR app_private.is_manager_of(owner_id) OR app_private.has_role('admin'));
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = app_private.current_employee_id());
DROP POLICY IF EXISTS notification_prefs_select ON public.notification_preferences;
CREATE POLICY notification_prefs_select ON public.notification_preferences FOR SELECT TO authenticated
  USING (employee_id = app_private.current_employee_id());

REVOKE ALL ON public.tasks, public.notifications, public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tasks, public.notifications, public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.notifications, public.notification_preferences TO service_role;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_task(
  p_owner_id uuid, p_title text, p_description text DEFAULT NULL, p_due_at timestamptz DEFAULT NULL,
  p_priority text DEFAULT 'normal', p_linked_type text DEFAULT NULL, p_linked_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := app_private.current_employee_id();
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT (p_owner_id = v_me OR app_private.is_manager_of(p_owner_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.tasks (owner_id, created_by, title, description, due_at, priority, linked_type, linked_id)
  VALUES (p_owner_id, v_me, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_due_at, p_priority, p_linked_type, p_linked_id)
  RETURNING id INTO v_id;
  IF p_owner_id <> v_me THEN
    PERFORM app_private.notify(p_owner_id, 'manual', 'Neue Aufgabe: ' || btrim(p_title), NULL, '/vertrieb/aufgaben');
  END IF;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_task_status(p_task_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (t.owner_id = app_private.current_employee_id() OR app_private.is_manager_of(t.owner_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'done', 'cancelled') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023'; END IF;
  UPDATE public.tasks
     SET status = p_status,
         completed_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END,
         completion_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = p_task_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_reassign_task(p_task_id uuid, p_new_owner uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  t public.tasks%ROWTYPE;
BEGIN
  PERFORM app_private.require_reason(p_reason);
  SELECT * INTO t FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (app_private.is_manager_of(t.owner_id) AND (p_new_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_new_owner))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tasks SET owner_id = p_new_owner WHERE id = p_task_id;
  PERFORM app_private.notify(p_new_owner, 'reassignment', 'Aufgabe übernommen: ' || t.title, p_reason, '/vertrieb/aufgaben');
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.notifications SET read_at = now()
   WHERE recipient_id = app_private.current_employee_id() AND read_at IS NULL
     AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_muted_notifications(p_kinds text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_kinds text[] := ARRAY(SELECT DISTINCT k FROM unnest(coalesce(p_kinds, '{}')) k WHERE NOT k = ANY (app_private.critical_kinds()));
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.notification_preferences (employee_id, muted_kinds) VALUES (v_me, v_kinds)
  ON CONFLICT (employee_id) DO UPDATE SET muted_kinds = EXCLUDED.muted_kinds, updated_at = now();
  RETURN v_kinds;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  RETURN app_private.run_task_generators();
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_create_task(uuid, text, text, timestamptz, text, text, uuid), public.rpc_set_task_status(uuid, text, text),
  public.rpc_reassign_task(uuid, uuid, text), public.rpc_mark_notifications_read(uuid[]), public.rpc_set_muted_notifications(text[]),
  public.rpc_run_task_generators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_task(uuid, text, text, timestamptz, text, text, uuid), public.rpc_set_task_status(uuid, text, text),
  public.rpc_reassign_task(uuid, uuid, text), public.rpc_mark_notifications_read(uuid[]), public.rpc_set_muted_notifications(text[]),
  public.rpc_run_task_generators() TO authenticated;
