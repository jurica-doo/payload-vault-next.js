-- ============================================================
-- r1/p4/activities: calls, contact attempts, appointments (§8.2, §9.1, §13)
-- ============================================================
-- One activity log for leads and (Phase 5) customers. Appointments are
-- activities of type 'appointment' with a scheduled time and an outcome:
--   booked (no outcome yet) → held | no_show | cancelled | rescheduled
-- Funnel definitions (§8.2, "define each stage so all employees count events
-- consistently"):
--   contact attempt = type 'contact_attempt' (outcome reached / not_reached)
--   appointment booked = appointment created in the window
--   appointment held   = appointment with outcome 'held', scheduled in the window
--   offer              = type 'offer'
--   follow-up          = type 'followup'
-- linked_type/linked_id point to a lead or customer; r1/p4/leads adds the
-- consistency check for leads.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  type          text NOT NULL CHECK (type IN ('call', 'email', 'contact_attempt', 'appointment', 'offer', 'followup', 'note')),
  linked_type   text CHECK (linked_type IN ('lead', 'customer')),
  linked_id     uuid,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  scheduled_at  timestamptz,
  outcome       text CHECK (outcome IN ('reached', 'not_reached', 'held', 'no_show', 'cancelled', 'rescheduled')),
  notes         text CHECK (notes IS NULL OR length(notes) <= 4000),
  production_id uuid REFERENCES public.production_records (id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_link_pair CHECK ((linked_type IS NULL) = (linked_id IS NULL)),
  CONSTRAINT activity_appointment_time CHECK (type <> 'appointment' OR scheduled_at IS NOT NULL),
  CONSTRAINT activity_outcome_fits CHECK (
    outcome IS NULL
    OR (type = 'contact_attempt' AND outcome IN ('reached', 'not_reached'))
    OR (type = 'appointment' AND outcome IN ('held', 'no_show', 'cancelled', 'rescheduled'))
    OR (type IN ('call', 'email') AND outcome IN ('reached', 'not_reached')))
);

CREATE INDEX IF NOT EXISTS idx_activities_owner_time ON public.activities (owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_link ON public.activities (linked_type, linked_id);

DROP TRIGGER IF EXISTS activities_touch ON public.activities;
CREATE TRIGGER activities_touch BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.activities', 'id', '{updated_at}', '{notes}');

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activities_select ON public.activities;
CREATE POLICY activities_select ON public.activities FOR SELECT TO authenticated
  USING (owner_id = app_private.current_employee_id() OR app_private.is_manager_of(owner_id) OR app_private.has_role('admin'));

REVOKE ALL ON public.activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO service_role;

-- Hook for linked-record checks (leads/customers add their own rules).
CREATE OR REPLACE FUNCTION app_private.check_activity_link(p_linked_type text, p_linked_id uuid, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN; -- replaced by r1/p4/leads
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_log_activity(
  p_type text, p_linked_type text DEFAULT NULL, p_linked_id uuid DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL, p_scheduled_at timestamptz DEFAULT NULL,
  p_outcome text DEFAULT NULL, p_notes text DEFAULT NULL, p_owner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_owner uuid := coalesce(p_owner_id, app_private.current_employee_id());
  v_id    uuid;
BEGIN
  IF v_me IS NULL OR NOT (v_owner = v_me OR app_private.is_manager_of(v_owner)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_occurred_at, now()) > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.check_activity_link(p_linked_type, p_linked_id, v_owner);
  INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, scheduled_at, outcome, notes, created_by)
  VALUES (v_owner, p_type, p_linked_type, p_linked_id, coalesce(p_occurred_at, now()), p_scheduled_at, p_outcome,
          nullif(btrim(coalesce(p_notes, '')), ''), v_me)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_appointment_outcome(p_activity_id uuid, p_outcome text, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  a public.activities%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (a.owner_id = app_private.current_employee_id() OR app_private.is_manager_of(a.owner_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF a.type <> 'appointment' THEN RAISE EXCEPTION 'not_an_appointment' USING ERRCODE = 'P0001'; END IF;
  IF p_outcome IN ('held', 'no_show') AND a.scheduled_at > now() THEN
    RAISE EXCEPTION 'appointment_in_future' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.activities
     SET outcome = p_outcome,
         notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
   WHERE id = p_activity_id;
END
$$;

-- Counts for one employee in [from, to) — goals, dashboards, profiles.
CREATE OR REPLACE FUNCTION public.rpc_activity_summary(p_employee_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from timestamptz := (p_from::timestamp AT TIME ZONE 'Europe/Berlin');
  v_to   timestamptz := (p_to::timestamp AT TIME ZONE 'Europe/Berlin');
BEGIN
  IF NOT (p_employee_id = app_private.current_employee_id() OR app_private.is_manager_of(p_employee_id) OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'contact_attempts', count(*) FILTER (WHERE type = 'contact_attempt' AND occurred_at >= v_from AND occurred_at < v_to),
      'reached', count(*) FILTER (WHERE type IN ('contact_attempt', 'call') AND outcome = 'reached' AND occurred_at >= v_from AND occurred_at < v_to),
      'appointments_booked', count(*) FILTER (WHERE type = 'appointment' AND created_at >= v_from AND created_at < v_to),
      'appointments_held', count(*) FILTER (WHERE type = 'appointment' AND outcome = 'held' AND scheduled_at >= v_from AND scheduled_at < v_to),
      'no_shows', count(*) FILTER (WHERE type = 'appointment' AND outcome = 'no_show' AND scheduled_at >= v_from AND scheduled_at < v_to),
      'offers', count(*) FILTER (WHERE type = 'offer' AND occurred_at >= v_from AND occurred_at < v_to),
      'followups', count(*) FILTER (WHERE type = 'followup' AND occurred_at >= v_from AND occurred_at < v_to),
      'upcoming_appointments', count(*) FILTER (WHERE type = 'appointment' AND outcome IS NULL AND scheduled_at >= now()))
      FROM public.activities WHERE owner_id = p_employee_id
  );
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_log_activity(text, text, uuid, timestamptz, timestamptz, text, text, uuid),
  public.rpc_set_appointment_outcome(uuid, text, text), public.rpc_activity_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_activity(text, text, uuid, timestamptz, timestamptz, text, text, uuid),
  public.rpc_set_appointment_outcome(uuid, text, text), public.rpc_activity_summary(uuid, date, date) TO authenticated;
