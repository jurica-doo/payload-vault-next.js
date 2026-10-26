-- ============================================================
-- r1/p6/advanced-analytics: source trends, trend prompts, auto-assignment (§9.3, §9.4, §8.3)
-- ============================================================
-- rpc_source_trends(months)  per source and receipt month: leads, contacted,
--                            won, points and commission from linked contracts,
--                            recorded cost, cost per lead / sale. Admins only
--                            (organisation-level money, like lead analytics).
-- rpc_team_signals()         rule-based prompts for leaders (own structure)
--                            and admins (everyone): last 30 days vs the 30
--                            before, only with enough data (min. 10 leads per
--                            window), worded as prompts in the UI (§8.5).
-- Auto-assignment (§9.3 "optional future"), OFF by default:
--   app_settings.lead_auto_assign {enabled, max_open_per_person}. Pool leads
--   created by a leader go to the active member of that leader's structure
--   with the fewest open leads (below the cap); ties → longest since the
--   last assignment. Recorded like a manual assignment (system actor).
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('lead_auto_assign', jsonb_build_object('enabled', false, 'max_open_per_person', 30),
        'Automatische Lead-Zuweisung nach Auslastung (aus)')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Source trends
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_source_trends(p_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from date := (date_trunc('month', app_private.business_today()) - make_interval(months => greatest(1, least(p_months, 36)) - 1))::date;
BEGIN
  IF NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x.month, x.name) FROM (
      SELECT s.id AS source_id, s.name, m.month,
             count(l.id) AS leads,
             count(l.id) FILTER (WHERE l.first_contact_at IS NOT NULL) AS contacted,
             count(l.id) FILTER (WHERE st.kind = 'won') AS won,
             coalesce(sum((SELECT sum(pc.points) FROM public.point_calculations pc WHERE pc.production_id = l.production_id)), 0) AS points,
             coalesce(sum((SELECT sum(cl.gross_amount) FROM public.commission_ledger cl WHERE cl.production_id = l.production_id)), 0) AS commission,
             c.amount AS cost,
             CASE WHEN c.amount IS NOT NULL AND count(l.id) > 0 THEN round(c.amount / count(l.id), 2) END AS cost_per_lead,
             CASE WHEN c.amount IS NOT NULL AND count(l.id) FILTER (WHERE st.kind = 'won') > 0
                  THEN round(c.amount / count(l.id) FILTER (WHERE st.kind = 'won'), 2) END AS cost_per_sale
        FROM public.lead_sources s
        CROSS JOIN (SELECT generate_series(v_from, date_trunc('month', app_private.business_today())::date, interval '1 month')::date AS month) m
        LEFT JOIN public.leads l ON l.source_id = s.id AND l.merged_into IS NULL
             AND date_trunc('month', l.received_at AT TIME ZONE 'Europe/Berlin')::date = m.month
        LEFT JOIN public.lead_stages st ON st.code = l.stage
        LEFT JOIN public.lead_source_costs c ON c.source_id = s.id AND c.month = m.month
       GROUP BY s.id, s.name, m.month, c.amount
      HAVING count(l.id) > 0 OR c.amount IS NOT NULL) x), '[]'::jsonb);
END
$$;

-- ------------------------------------------------------------
-- Trend signals
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_team_signals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     uuid := app_private.current_employee_id();
  v_all    boolean := app_private.has_role('admin');
  v_owners uuid[];
  v_out    jsonb := '[]'::jsonb;
  w        record;
  r        record;
BEGIN
  IF NOT v_all THEN
    IF v_me IS NULL OR NOT app_private.is_leader() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    v_owners := array_append(ARRAY(SELECT d.descendant_id FROM app_private.descendants_at(v_me, app_private.business_today()) d), v_me);
  END IF;

  -- Team rates: last 30 days vs the 30 days before (cohort by receipt).
  SELECT
    count(*) FILTER (WHERE l.received_at >= now() - interval '30 days') AS n_now,
    count(*) FILTER (WHERE l.received_at < now() - interval '30 days') AS n_before,
    count(*) FILTER (WHERE l.received_at >= now() - interval '30 days' AND l.first_contact_at IS NOT NULL) AS c_now,
    count(*) FILTER (WHERE l.received_at < now() - interval '30 days' AND l.first_contact_at IS NOT NULL) AS c_before,
    count(*) FILTER (WHERE l.received_at >= now() - interval '30 days' AND (l.first_contact_at > l.sla_due_at OR (l.first_contact_at IS NULL AND l.sla_due_at < now()))) AS late_now,
    count(*) FILTER (WHERE l.received_at < now() - interval '30 days' AND (l.first_contact_at > l.sla_due_at OR (l.first_contact_at IS NULL AND l.sla_due_at < now() - interval '30 days'))) AS late_before,
    count(*) FILTER (WHERE l.received_at >= now() - interval '30 days' AND EXISTS (
      SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = l.id AND a.type = 'appointment')) AS b_now,
    count(*) FILTER (WHERE l.received_at < now() - interval '30 days' AND EXISTS (
      SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = l.id AND a.type = 'appointment')) AS b_before
    INTO w
    FROM public.leads l
   WHERE l.merged_into IS NULL AND l.received_at >= now() - interval '60 days'
     AND (v_all OR l.owner_id = ANY (v_owners));

  IF w.n_now >= 10 AND w.n_before >= 10 THEN
    IF w.c_now::numeric / w.n_now < 0.8 * (w.c_before::numeric / w.n_before) THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'contact_rate_down', 'severity', 'warning',
        'now', jsonb_build_object('num', w.c_now, 'den', w.n_now), 'before', jsonb_build_object('num', w.c_before, 'den', w.n_before)));
    END IF;
    IF w.b_now::numeric / w.n_now < 0.8 * (w.b_before::numeric / w.n_before) THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'booking_rate_down', 'severity', 'info',
        'now', jsonb_build_object('num', w.b_now, 'den', w.n_now), 'before', jsonb_build_object('num', w.b_before, 'den', w.n_before)));
    END IF;
    IF w.late_now::numeric / w.n_now > 1.25 * (w.late_before::numeric / w.n_before) AND w.late_now >= 3 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'sla_breaches_up', 'severity', 'warning',
        'now', jsonb_build_object('num', w.late_now, 'den', w.n_now), 'before', jsonb_build_object('num', w.late_before, 'den', w.n_before)));
    END IF;
  END IF;

  -- Per person: many overdue tasks, or many open leads without a next step.
  FOR r IN SELECT e.id, e.first_name || ' ' || e.last_name AS name,
                  (SELECT count(*) FROM public.tasks t WHERE t.owner_id = e.id AND t.status = 'open' AND t.due_at < now() - interval '2 days') AS overdue,
                  (SELECT count(*) FROM public.leads l JOIN public.lead_stages s ON s.code = l.stage
                    WHERE l.owner_id = e.id AND l.merged_into IS NULL AND s.kind = 'open' AND l.first_contact_at IS NOT NULL
                      AND l.next_action_at IS NULL) AS no_next
             FROM public.employees e
            WHERE e.status = 'active' AND (v_all OR e.id = ANY (v_owners)) LOOP
    IF r.overdue >= 5 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'overdue_tasks', 'severity', 'warning', 'employee_id', r.id, 'name', r.name, 'count', r.overdue));
    END IF;
    IF r.no_next >= 5 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'leads_without_next_step', 'severity', 'info', 'employee_id', r.id, 'name', r.name, 'count', r.no_next));
    END IF;
  END LOOP;
  RETURN v_out;
END
$$;

-- ------------------------------------------------------------
-- Auto-assignment (off by default)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.auto_assign_pool_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s       jsonb := (SELECT value FROM public.app_settings WHERE key = 'lead_auto_assign');
  v_cap   integer := coalesce((s ->> 'max_open_per_person')::integer, 30);
  l       record;
  v_to    uuid;
  v_n     integer := 0;
BEGIN
  IF NOT coalesce((s ->> 'enabled')::boolean, false) THEN RETURN 0; END IF;
  FOR l IN SELECT x.id, x.created_by, x.stage, app_private.lead_display_name(x) AS name
             FROM public.leads x JOIN public.lead_stages st ON st.code = x.stage AND st.kind IN ('open', 'nurture')
            WHERE x.owner_id IS NULL AND x.merged_into IS NULL AND x.erased_at IS NULL AND x.created_by IS NOT NULL
            ORDER BY x.received_at
            FOR UPDATE OF x SKIP LOCKED LOOP
    SELECT d.descendant_id INTO v_to
      FROM app_private.descendants_at(l.created_by, app_private.business_today()) d
      JOIN public.employees e ON e.id = d.descendant_id AND e.status = 'active'
      CROSS JOIN LATERAL (
        SELECT count(*) AS open_leads FROM public.leads o JOIN public.lead_stages os ON os.code = o.stage
         WHERE o.owner_id = d.descendant_id AND o.merged_into IS NULL AND os.kind IN ('open', 'nurture')) w
      LEFT JOIN LATERAL (SELECT max(a.assigned_at) AS last_at FROM public.lead_assignments a WHERE a.to_owner = d.descendant_id) la ON true
     WHERE w.open_leads < v_cap
     ORDER BY w.open_leads, la.last_at NULLS FIRST, d.descendant_id
     LIMIT 1;
    CONTINUE WHEN v_to IS NULL;
    PERFORM app_private.set_audit_context('Automatische Zuweisung (geringste Auslastung)');
    UPDATE public.leads SET owner_id = v_to, assigned_by = NULL, assigned_at = now() WHERE id = l.id;
    INSERT INTO public.lead_assignments (lead_id, from_owner, to_owner, assigned_by, reason)
    VALUES (l.id, NULL, v_to, NULL, 'Automatische Zuweisung (geringste Auslastung)');
    IF l.stage = 'new' THEN PERFORM app_private.move_lead(l.id, 'assigned', true, 'Automatisch zugewiesen'); END IF;
    PERFORM app_private.notify(v_to, 'lead_assigned', 'Neuer Lead: ' || l.name, 'Automatisch zugewiesen', '/vertrieb/leads/' || l.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_lead_auto_assign(p_enabled boolean, p_max_open integer, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.assert_admin();
  PERFORM app_private.require_reason(p_reason);
  IF p_max_open IS NULL OR p_max_open NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  UPDATE public.app_settings SET value = jsonb_build_object('enabled', p_enabled, 'max_open_per_person', p_max_open),
         updated_at = now(), updated_by = auth.uid()
   WHERE key = 'lead_auto_assign';
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_lead_auto_assign_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT value FROM public.app_settings WHERE key = 'lead_auto_assign' AND app_private.has_role('admin') $$;

-- Assignment runs before the lead task generators, so assigned leads get their first-contact task at once.
CREATE OR REPLACE FUNCTION app_private.run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auto      integer := app_private.auto_assign_pool_leads();
  v_leads     jsonb := app_private.run_lead_task_generators();
  v_customers jsonb := app_private.run_customer_task_generators();
BEGIN
  RETURN app_private.run_core_task_generators() || v_leads || v_customers || jsonb_build_object('auto_assigned', v_auto);
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_source_trends(integer), public.rpc_team_signals(),
  public.rpc_set_lead_auto_assign(boolean, integer, text), public.rpc_lead_auto_assign_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_source_trends(integer), public.rpc_team_signals(),
  public.rpc_set_lead_auto_assign(boolean, integer, text), public.rpc_lead_auto_assign_settings() TO authenticated;
