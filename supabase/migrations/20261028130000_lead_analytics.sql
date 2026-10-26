-- ============================================================
-- r1/p4/lead-analytics: lead funnel and source performance (§8.2, §9.4)
-- ============================================================
-- rpc_lead_funnel(from, to, scope) — one cohort: leads RECEIVED in
-- [from, to) (Europe/Berlin dates), attributed to their CURRENT owner.
-- Merged duplicates are excluded.
--
-- Funnel steps count leads that got at least this far: the furthest open
-- stage the lead ever entered (stage history), plus the hard facts (first
-- contact, reached call, booked/held appointment). A won lead counts as
-- having passed every step, so the funnel never increases when stages are
-- skipped. Every rate is returned with its numerator and denominator.
--
-- Scopes: 'me' (own leads), 'team' (own + structure today), 'all' (admins,
-- includes the pool). Source costs, cost per lead/sale and commission per
-- source are organisation-level numbers and only returned for 'all'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_lead_funnel(p_from date, p_to date, p_scope text DEFAULT 'me')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     uuid := app_private.current_employee_id();
  v_from   timestamptz := p_from::timestamp AT TIME ZONE 'Europe/Berlin';
  v_to     timestamptz := p_to::timestamp AT TIME ZONE 'Europe/Berlin';
  v_owners uuid[];
  v_all    boolean := p_scope = 'all';
  pos_att    integer := (SELECT position FROM public.lead_stages WHERE code = 'contact_attempted');
  pos_con    integer := (SELECT position FROM public.lead_stages WHERE code = 'contacted');
  pos_qual   integer := (SELECT position FROM public.lead_stages WHERE code = 'qualified');
  pos_book   integer := (SELECT position FROM public.lead_stages WHERE code = 'appointment_booked');
  pos_held   integer := (SELECT position FROM public.lead_stages WHERE code = 'appointment_held');
  pos_offer  integer := (SELECT position FROM public.lead_stages WHERE code = 'offer');
  v_result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > 731 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_scope = 'me' THEN
    IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    v_owners := ARRAY[v_me];
  ELSIF p_scope = 'team' THEN
    IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    v_owners := array_append(ARRAY(SELECT d.descendant_id FROM app_private.descendants_at(v_me, app_private.business_today()) d), v_me);
  ELSIF p_scope = 'all' THEN
    IF NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  WITH base AS (
    SELECT l.*, s.kind AS stage_kind, s.position AS stage_pos
      FROM public.leads l JOIN public.lead_stages s ON s.code = l.stage
     WHERE l.merged_into IS NULL AND l.received_at >= v_from AND l.received_at < v_to
       AND (v_all OR l.owner_id = ANY (v_owners))
  ),
  f AS (
    SELECT b.*,
           b.stage_kind = 'won' AS won,
           greatest(
             coalesce((SELECT max(s.position) FROM public.lead_stage_history h JOIN public.lead_stages s ON s.code = h.to_stage
                        WHERE h.lead_id = b.id AND s.kind = 'open'), 0),
             CASE WHEN b.stage_kind = 'won' THEN 2147483647 ELSE 0 END) AS max_pos,
           EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = b.id AND a.outcome = 'reached') AS reached_act,
           EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = b.id AND a.type = 'appointment') AS booked_act,
           EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = b.id AND a.type = 'appointment' AND a.outcome = 'held') AS held_act,
           extract(epoch FROM (b.first_contact_at - b.received_at)) / 3600.0 AS fc_hours
      FROM base b
  ),
  g AS (
    SELECT f.*,
           f.first_contact_at IS NOT NULL OR f.max_pos >= pos_att AS s_contacted,
           f.reached_act OR f.max_pos >= pos_con AS s_reached,
           f.max_pos >= pos_qual AS s_qualified,
           f.booked_act OR f.max_pos >= pos_book AS s_booked,
           f.held_act OR f.max_pos >= pos_held AS s_held,
           f.max_pos >= pos_offer AS s_offer,
           (SELECT coalesce(sum(pc.points), 0) FROM public.point_calculations pc WHERE pc.production_id = f.production_id) AS points,
           CASE WHEN v_all THEN (SELECT coalesce(sum(cl.gross_amount), 0) FROM public.commission_ledger cl WHERE cl.production_id = f.production_id) END AS commission
      FROM f
  )
  SELECT jsonb_build_object(
    'window', jsonb_build_object('from', p_from, 'to', p_to),
    'scope', p_scope,
    'totals', (SELECT jsonb_build_object(
        'leads', count(*),
        'contacted', count(*) FILTER (WHERE s_contacted),
        'reached', count(*) FILTER (WHERE s_reached),
        'qualified', count(*) FILTER (WHERE s_qualified),
        'booked', count(*) FILTER (WHERE s_booked),
        'held', count(*) FILTER (WHERE s_held),
        'offer', count(*) FILTER (WHERE s_offer),
        'won', count(*) FILTER (WHERE won),
        'lost', count(*) FILTER (WHERE stage_kind = 'lost'),
        'open', count(*) FILTER (WHERE stage_kind IN ('open', 'nurture')),
        'unassigned', count(*) FILTER (WHERE owner_id IS NULL)) FROM g),
    'first_contact', (SELECT jsonb_build_object(
        'contacted', count(*) FILTER (WHERE fc_hours IS NOT NULL),
        'avg_hours', round(avg(fc_hours)::numeric, 1),
        'median_hours', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY fc_hours))::numeric, 1),
        'within_sla', count(*) FILTER (WHERE first_contact_at <= sla_due_at),
        'overdue_open', count(*) FILTER (WHERE first_contact_at IS NULL AND closed_at IS NULL AND sla_due_at < now())) FROM g),
    'by_source', coalesce((SELECT jsonb_agg(x ORDER BY x.leads DESC, x.name) FROM (
        SELECT src.id AS source_id, src.name, count(g.id) AS leads,
               count(*) FILTER (WHERE g.s_contacted) AS contacted,
               count(*) FILTER (WHERE g.s_booked) AS booked,
               count(*) FILTER (WHERE g.won) AS won,
               sum(g.points) AS points,
               sum(g.commission) AS commission,
               c.cost,
               CASE WHEN c.cost IS NOT NULL AND count(g.id) > 0 THEN round(c.cost / count(g.id), 2) END AS cost_per_lead,
               CASE WHEN c.cost IS NOT NULL AND count(*) FILTER (WHERE g.won) > 0 THEN round(c.cost / count(*) FILTER (WHERE g.won), 2) END AS cost_per_sale
          FROM g JOIN public.lead_sources src ON src.id = g.source_id
          LEFT JOIN LATERAL (
            SELECT sum(lc.amount) AS cost FROM public.lead_source_costs lc
             WHERE v_all AND lc.source_id = src.id AND lc.month >= date_trunc('month', p_from)::date AND lc.month < p_to
          ) c ON true
         GROUP BY src.id, src.name, c.cost) x), '[]'::jsonb),
    'by_owner', coalesce((SELECT jsonb_agg(x ORDER BY x.leads DESC) FROM (
        SELECT g.owner_id, CASE WHEN e.id IS NULL THEN NULL ELSE e.first_name || ' ' || e.last_name END AS name,
               count(*) AS leads,
               count(*) FILTER (WHERE g.s_contacted) AS contacted,
               count(*) FILTER (WHERE g.s_booked) AS booked,
               count(*) FILTER (WHERE g.won) AS won,
               round(avg(g.fc_hours)::numeric, 1) AS avg_first_contact_hours
          FROM g LEFT JOIN public.employees e ON e.id = g.owner_id
         GROUP BY g.owner_id, e.id, e.first_name, e.last_name) x), '[]'::jsonb),
    'by_stage', coalesce((SELECT jsonb_agg(x ORDER BY x.position) FROM (
        SELECT s.code AS stage, s.name_de AS name, s.position, count(g.id) AS leads,
               round(avg(extract(epoch FROM (now() - g.received_at)) / 86400.0)::numeric, 1) AS avg_age_days
          FROM public.lead_stages s JOIN g ON g.stage = s.code
         WHERE s.kind IN ('open', 'nurture')
         GROUP BY s.code, s.name_de, s.position) x), '[]'::jsonb),
    'loss_reasons', coalesce((SELECT jsonb_agg(x ORDER BY x.leads DESC) FROM (
        SELECT coalesce(g.loss_reason, 'unknown') AS reason, count(*) AS leads FROM g WHERE g.stage_kind = 'lost' GROUP BY 1) x), '[]'::jsonb),
    'by_month', coalesce((SELECT jsonb_agg(x ORDER BY x.month) FROM (
        SELECT date_trunc('month', g.received_at AT TIME ZONE 'Europe/Berlin')::date AS month,
               count(*) AS leads, count(*) FILTER (WHERE g.won) AS won
          FROM g GROUP BY 1) x), '[]'::jsonb))
  INTO v_result;
  RETURN v_result;
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_lead_funnel(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_lead_funnel(date, date, text) TO authenticated;
