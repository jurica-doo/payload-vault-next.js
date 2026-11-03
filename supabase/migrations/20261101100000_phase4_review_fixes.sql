-- ============================================================
-- Phase 4 review fixes (requirements1/phase-4-leads-tasks/verification/r1-p4-verification.md)
-- ============================================================
--   P4-SEC-01   pool leads belong to the creator's structure: visible and workable only for
--               admins and for leaders who created the lead or manage its creator
--   P4-DATA-01  appointments and offers count as first contact (+ backfill)
--   P4-DATA-03  empty optional lead texts are stored as NULL (+ backfill)
--   P4-NOTIF-01 generator runs send one notification per recipient and kind (digest);
--               each overdue lead escalates once (leads.sla_escalated_at)
--   P4-UX-10    system tasks close themselves; managers may dismiss one with a reason
--               (tasks.dismissed), and it is then not recreated for that owner
--   P4-API-01   rpc_create_lead rejects unknown keys
--   P4-API-02   named error keys instead of raw CHECK violations
-- ============================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_escalated_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- P4-SEC-01: visibility and write access with the creator for pool leads
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_see_lead(p_owner uuid, p_created_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN app_private.has_role('admin')
      OR (app_private.is_leader()
          AND (p_created_by = app_private.current_employee_id() OR app_private.is_manager_of(p_created_by)))
    ELSE p_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_owner) OR app_private.has_role('admin')
  END
$$;

-- Write: like read, but an admin who is neither owner nor manager needs MFA.
CREATE OR REPLACE FUNCTION app_private.assert_can_write_lead(p_owner uuid, p_created_by uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NOT NULL AND (p_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_owner)) THEN
    RETURN;
  END IF;
  IF p_owner IS NULL AND app_private.is_leader()
     AND (p_created_by = app_private.current_employee_id() OR app_private.is_manager_of(p_created_by)) THEN
    RETURN;
  END IF;
  IF app_private.has_role('admin') THEN
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END
$$;

GRANT EXECUTE ON FUNCTION app_private.can_see_lead(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
  USING (merged_into IS NULL AND app_private.can_see_lead(owner_id, created_by));

-- ------------------------------------------------------------
-- P4-DATA-03 + P4-API-02: lead texts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.validate_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.first_name  := nullif(btrim(NEW.first_name), '');
  NEW.last_name   := nullif(btrim(NEW.last_name), '');
  NEW.company     := nullif(btrim(NEW.company), '');
  NEW.phone       := nullif(btrim(NEW.phone), '');
  NEW.email       := nullif(lower(btrim(NEW.email)), '');
  NEW.notes       := nullif(btrim(NEW.notes), '');
  NEW.region      := nullif(btrim(NEW.region), '');
  NEW.campaign    := nullif(btrim(NEW.campaign), '');
  NEW.referral    := nullif(btrim(NEW.referral), '');
  NEW.next_action := nullif(btrim(NEW.next_action), '');
  IF length(NEW.first_name) > 100 OR length(NEW.last_name) > 100 OR length(NEW.company) > 200
     OR length(NEW.region) > 100 OR length(NEW.campaign) > 200 OR length(NEW.referral) > 200
     OR length(NEW.next_action) > 300 OR length(NEW.notes) > 4000 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  IF NEW.last_name IS NULL AND NEW.company IS NULL THEN
    RAISE EXCEPTION 'lead_name_required' USING ERRCODE = '22023';
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.product_interest) p
              WHERE NOT EXISTS (SELECT 1 FROM public.product_categories c WHERE c.code = p)) THEN
    RAISE EXCEPTION 'unknown_category' USING ERRCODE = '22023';
  END IF;
  IF NEW.received_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.source_id IS DISTINCT FROM OLD.source_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.lead_sources s WHERE s.id = NEW.source_id AND s.active) THEN
      RAISE EXCEPTION 'unknown_source' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.consent_basis IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.consent_basis END) THEN
    NEW.consent_recorded_at := CASE WHEN NEW.consent_basis IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END
$$;

-- P4-API-01: same allow-list as rpc_update_lead (+ received_at); P4-SEC-01: pool needs a leader.
CREATE OR REPLACE FUNCTION app_rpc.rpc_create_lead(p_data jsonb, p_owner_id uuid DEFAULT NULL::uuid, p_to_pool boolean DEFAULT false, p_confirm_duplicates boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_owner uuid := CASE WHEN p_to_pool THEN NULL ELSE coalesce(p_owner_id, app_private.current_employee_id()) END;
  l       public.leads%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(p_data, '{}')) k WHERE k NOT IN (
      'first_name', 'last_name', 'company', 'phone', 'email', 'preferred_channel', 'source_id', 'campaign', 'referral',
      'received_at', 'product_interest', 'region', 'priority', 'consent_basis', 'notes', 'next_action', 'next_action_at')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF v_owner IS NULL OR v_owner <> v_me THEN
    PERFORM app_private.assert_can_write_lead(v_owner, v_me);
  END IF;
  IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_owner AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_confirm_duplicates AND EXISTS (
    SELECT 1 FROM app_private.lead_duplicates(p_data ->> 'first_name', p_data ->> 'last_name', p_data ->> 'company',
                                              p_data ->> 'phone', p_data ->> 'email')) THEN
    RAISE EXCEPTION 'possible_duplicate' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.set_audit_context('Lead angelegt');
  INSERT INTO public.leads (
    first_name, last_name, company, phone, email, preferred_channel, source_id, campaign, referral, received_at,
    owner_id, assigned_by, assigned_at, created_by, product_interest, region, priority, consent_basis, notes,
    stage, next_action, next_action_at)
  VALUES (
    p_data ->> 'first_name', p_data ->> 'last_name', p_data ->> 'company', p_data ->> 'phone', p_data ->> 'email',
    coalesce(p_data ->> 'preferred_channel', 'any'), (p_data ->> 'source_id')::uuid, p_data ->> 'campaign', p_data ->> 'referral',
    coalesce((p_data ->> 'received_at')::timestamptz, now()),
    v_owner, CASE WHEN v_owner IS NOT NULL THEN v_me END, CASE WHEN v_owner IS NOT NULL THEN now() END, v_me,
    coalesce(ARRAY(SELECT jsonb_array_elements_text(p_data -> 'product_interest')), '{}'),
    p_data ->> 'region', coalesce(p_data ->> 'priority', 'normal'), p_data ->> 'consent_basis', p_data ->> 'notes',
    CASE WHEN v_owner IS NULL THEN 'new' ELSE 'assigned' END,
    p_data ->> 'next_action', (p_data ->> 'next_action_at')::timestamptz)
  RETURNING * INTO l;

  UPDATE public.leads SET sla_due_at = app_private.lead_sla_due(l.received_at) WHERE id = l.id;
  INSERT INTO public.lead_stage_history (lead_id, from_stage, to_stage, changed_by, note)
  VALUES (l.id, NULL, l.stage, v_me, 'Angelegt');
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.lead_assignments (lead_id, from_owner, to_owner, assigned_by, reason)
    VALUES (l.id, NULL, v_owner, v_me, 'Angelegt');
    IF v_owner <> v_me THEN
      PERFORM app_private.notify(v_owner, 'lead_assigned', 'Neuer Lead: ' || app_private.lead_display_name(l), NULL, '/vertrieb/leads/' || l.id);
    END IF;
  END IF;
  RETURN l.id;
END
$$;

-- ------------------------------------------------------------
-- Callers of the lead helpers (bodies unchanged apart from the helper call;
-- rpc_assign_lead also resets the escalation marker, the generator escalates once,
-- lead_activity_effects counts appointments and offers as first contact)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_set_lead_stage(p_lead_id uuid, p_stage text, p_note text DEFAULT NULL::text, p_loss_reason text DEFAULT NULL::text, p_next_action text DEFAULT NULL::text, p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_production_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  l       public.leads%ROWTYPE;
  v_cur   public.lead_stages%ROWTYPE;
  v_new   public.lead_stages%ROWTYPE;
  v_miss  text[];
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id, l.created_by);
  SELECT * INTO v_new FROM public.lead_stages WHERE code = p_stage AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_stage' USING ERRCODE = '22023'; END IF;
  IF p_stage = l.stage THEN RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_cur FROM public.lead_stages WHERE code = l.stage;

  -- Going back, or reopening a closed lead, needs a reason.
  IF v_cur.kind <> 'open' AND v_new.kind = 'open' OR (v_cur.kind = 'open' AND v_new.kind = 'open' AND v_new.position < v_cur.position) THEN
    PERFORM app_private.require_reason(p_note);
  ELSE
    PERFORM app_private.set_audit_context(coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Phase geändert'));
  END IF;
  -- Skipping open stages is allowed only if the target allows it.
  IF v_new.kind = 'open' AND v_cur.kind = 'open' AND NOT v_new.allow_skip AND EXISTS (
    SELECT 1 FROM public.lead_stages s WHERE s.kind = 'open' AND s.active AND s.position > v_cur.position AND s.position < v_new.position) THEN
    RAISE EXCEPTION 'stage_skip_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  IF p_production_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_records pr WHERE pr.id = p_production_id AND pr.producer_id = l.owner_id) THEN
    RAISE EXCEPTION 'production_not_owner' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.move_lead(l.id, p_stage, false, p_note);
  UPDATE public.leads
     SET loss_reason = CASE WHEN v_new.kind = 'lost' THEN p_loss_reason END,
         next_action = coalesce(nullif(btrim(coalesce(p_next_action, '')), ''), next_action),
         next_action_at = coalesce(p_next_action_at, next_action_at),
         production_id = coalesce(p_production_id, production_id)
   WHERE id = l.id
   RETURNING * INTO l;

  v_miss := app_private.lead_missing_fields(l, v_new.required_fields);
  IF cardinality(v_miss) > 0 THEN
    RAISE EXCEPTION 'stage_requirements_missing' USING ERRCODE = 'P0001', DETAIL = array_to_string(v_miss, ',');
  END IF;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_merge_leads(p_keep_id uuid, p_merge_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  k public.leads%ROWTYPE;
  m public.leads%ROWTYPE;
BEGIN
  IF p_keep_id = p_merge_id THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  -- Lock both in a fixed order.
  PERFORM 1 FROM public.leads WHERE id IN (p_keep_id, p_merge_id) ORDER BY id FOR UPDATE;
  SELECT * INTO k FROM public.leads WHERE id = p_keep_id;
  SELECT * INTO m FROM public.leads WHERE id = p_merge_id;
  IF k.id IS NULL OR m.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF k.merged_into IS NOT NULL OR m.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(k.owner_id, k.created_by);
  PERFORM app_private.assert_can_write_lead(m.owner_id, m.created_by);
  PERFORM app_private.require_reason(p_reason);

  UPDATE public.leads SET
    first_name = coalesce(k.first_name, m.first_name),
    last_name = coalesce(k.last_name, m.last_name),
    company = coalesce(k.company, m.company),
    phone = coalesce(k.phone, m.phone),
    email = coalesce(k.email, m.email),
    region = coalesce(k.region, m.region),
    consent_basis = coalesce(k.consent_basis, m.consent_basis),
    product_interest = ARRAY(SELECT DISTINCT unnest(k.product_interest || m.product_interest) ORDER BY 1),
    received_at = least(k.received_at, m.received_at),
    first_contact_at = CASE WHEN k.first_contact_at IS NULL OR m.first_contact_at IS NULL
                            THEN coalesce(k.first_contact_at, m.first_contact_at)
                            ELSE least(k.first_contact_at, m.first_contact_at) END,
    notes = left(nullif(concat_ws(E'\n', k.notes, m.notes), ''), 4000)
  WHERE id = k.id;
  UPDATE public.activities SET linked_id = k.id WHERE linked_type = 'lead' AND linked_id = m.id;
  UPDATE public.leads SET merged_into = k.id, closed_at = coalesce(closed_at, now()) WHERE id = m.id;
  INSERT INTO public.lead_stage_history (lead_id, from_stage, to_stage, changed_by, note)
  VALUES (m.id, m.stage, m.stage, app_private.current_employee_id(), 'Zusammengeführt mit L-' || k.lead_no || ': ' || btrim(p_reason));
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_convert_lead(p_lead_id uuid, p_confirm_duplicates boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  l    public.leads%ROWTYPE;
  v_id uuid;
  v_kind text;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  IF l.customer_id IS NOT NULL THEN RAISE EXCEPTION 'already_converted' USING ERRCODE = 'P0001'; END IF;
  IF l.owner_id IS NULL THEN RAISE EXCEPTION 'lead_unassigned' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id, l.created_by);

  v_id := public.rpc_create_customer(
    jsonb_strip_nulls(jsonb_build_object(
      'first_name', l.first_name, 'last_name', l.last_name, 'company', l.company, 'phone', l.phone, 'email', l.email,
      'preferred_channel', CASE WHEN l.preferred_channel = 'any' THEN NULL ELSE l.preferred_channel END,
      'notes', l.notes)),
    l.owner_id, p_confirm_duplicates);
  UPDATE public.customers SET lead_id = l.id WHERE id = v_id;
  UPDATE public.leads SET customer_id = v_id WHERE id = l.id;

  SELECT kind INTO v_kind FROM public.lead_stages WHERE code = l.stage;
  IF v_kind IN ('open', 'nurture') THEN
    PERFORM app_private.move_lead(l.id, 'won', false, 'In Kunden umgewandelt');
  END IF;
  RETURN v_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_find_lead_duplicates(p_first_name text, p_last_name text, p_company text, p_phone text, p_email text, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF app_private.current_employee_id() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', CASE WHEN v.visible THEN d.lead_id END,
             'lead_no', CASE WHEN v.visible THEN l.lead_no END,
             'name', CASE WHEN v.visible THEN btrim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '') || ' ' || coalesce(l.company, '')) END,
             'stage', CASE WHEN v.visible THEN l.stage END,
             'owner', CASE WHEN e.id IS NULL THEN NULL ELSE e.first_name || ' ' || e.last_name END,
             'reason', d.reason, 'visible', v.visible) ORDER BY d.score DESC)
      FROM app_private.lead_duplicates(p_first_name, p_last_name, p_company, p_phone, p_email, p_exclude) d
      JOIN public.leads l ON l.id = d.lead_id
      LEFT JOIN public.employees e ON e.id = d.owner_id
      CROSS JOIN LATERAL (SELECT app_private.can_see_lead(d.owner_id, l.created_by) AS visible) v), '[]'::jsonb);
END
$function$

;

CREATE OR REPLACE FUNCTION app_private.check_activity_link(p_linked_type text, p_linked_id uuid, p_owner uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  l public.leads%ROWTYPE;
  c public.customers%ROWTYPE;
BEGIN
  IF p_linked_type IS NULL OR p_linked_id IS NULL THEN RETURN; END IF; -- the link-pair constraint rejects half links
  IF p_linked_type = 'customer' THEN
    SELECT * INTO c FROM public.customers WHERE id = p_linked_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
    PERFORM app_private.assert_can_write_customer(c.owner_id);
    RETURN;
  END IF;
  SELECT * INTO l FROM public.leads WHERE id = p_linked_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id, l.created_by);
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_update_lead(p_lead_id uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id, l.created_by);
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN (
      'first_name', 'last_name', 'company', 'phone', 'email', 'preferred_channel', 'source_id', 'campaign', 'referral',
      'product_interest', 'region', 'priority', 'consent_basis', 'notes', 'next_action', 'next_action_at')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.set_audit_context('Lead bearbeitet');
  UPDATE public.leads SET
    first_name = CASE WHEN p_data ? 'first_name' THEN p_data ->> 'first_name' ELSE first_name END,
    last_name = CASE WHEN p_data ? 'last_name' THEN p_data ->> 'last_name' ELSE last_name END,
    company = CASE WHEN p_data ? 'company' THEN p_data ->> 'company' ELSE company END,
    phone = CASE WHEN p_data ? 'phone' THEN p_data ->> 'phone' ELSE phone END,
    email = CASE WHEN p_data ? 'email' THEN p_data ->> 'email' ELSE email END,
    preferred_channel = CASE WHEN p_data ? 'preferred_channel' THEN coalesce(p_data ->> 'preferred_channel', 'any') ELSE preferred_channel END,
    source_id = CASE WHEN p_data ? 'source_id' THEN (p_data ->> 'source_id')::uuid ELSE source_id END,
    campaign = CASE WHEN p_data ? 'campaign' THEN p_data ->> 'campaign' ELSE campaign END,
    referral = CASE WHEN p_data ? 'referral' THEN p_data ->> 'referral' ELSE referral END,
    product_interest = CASE WHEN p_data ? 'product_interest'
                         THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(p_data -> 'product_interest')), '{}') ELSE product_interest END,
    region = CASE WHEN p_data ? 'region' THEN p_data ->> 'region' ELSE region END,
    priority = CASE WHEN p_data ? 'priority' THEN coalesce(p_data ->> 'priority', 'normal') ELSE priority END,
    consent_basis = CASE WHEN p_data ? 'consent_basis' THEN p_data ->> 'consent_basis' ELSE consent_basis END,
    notes = CASE WHEN p_data ? 'notes' THEN p_data ->> 'notes' ELSE notes END,
    next_action = CASE WHEN p_data ? 'next_action' THEN p_data ->> 'next_action' ELSE next_action END,
    next_action_at = CASE WHEN p_data ? 'next_action_at' THEN (p_data ->> 'next_action_at')::timestamptz ELSE next_action_at END
  WHERE id = p_lead_id;
END
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_assign_lead(p_lead_id uuid, p_owner_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  l       public.leads%ROWTYPE;
  v_kind  text;
  v_moved integer := 0;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF l.merged_into IS NOT NULL THEN RAISE EXCEPTION 'lead_merged' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_lead(l.owner_id, l.created_by);
  IF p_owner_id IS NOT DISTINCT FROM l.owner_id THEN RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001'; END IF;
  SELECT kind INTO v_kind FROM public.lead_stages WHERE code = l.stage;
  IF v_kind IN ('won', 'lost') THEN RAISE EXCEPTION 'lead_closed' USING ERRCODE = 'P0001'; END IF;

  -- Target: yourself, someone in your structure, or the pool (leaders); admins anyone (with MFA).
  IF p_owner_id IS NULL THEN
    IF NOT (app_private.is_leader() OR app_private.has_role('admin')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  ELSIF NOT (p_owner_id = v_me OR app_private.is_manager_of(p_owner_id)) THEN
    IF NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;

  -- First assignment from the pool needs no reason; every reassignment does (§9.3).
  IF l.owner_id IS NULL THEN
    PERFORM app_private.set_audit_context(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Lead zugewiesen'));
  ELSE
    PERFORM app_private.require_reason(p_reason);
  END IF;

  UPDATE public.leads
     SET owner_id = p_owner_id,
         assigned_by = CASE WHEN p_owner_id IS NULL THEN NULL ELSE v_me END,
         assigned_at = CASE WHEN p_owner_id IS NULL THEN NULL ELSE now() END,
         sla_escalated_at = NULL
   WHERE id = l.id;
  INSERT INTO public.lead_assignments (lead_id, from_owner, to_owner, assigned_by, reason)
  VALUES (l.id, l.owner_id, p_owner_id, v_me, nullif(btrim(coalesce(p_reason, '')), ''));

  IF p_owner_id IS NOT NULL AND l.stage = 'new' THEN
    PERFORM app_private.move_lead(l.id, 'assigned', true, 'Zugewiesen');
  ELSIF p_owner_id IS NULL AND l.stage = 'assigned' THEN
    PERFORM app_private.move_lead(l.id, 'new', true, 'Zurück in den Pool');
  END IF;

  -- Upcoming appointments go with the lead, so the new owner sees them.
  IF p_owner_id IS NOT NULL THEN
    UPDATE public.activities
       SET owner_id = p_owner_id,
           notes = left(coalesce(notes || E'\n', '') || 'Übernommen bei Neuzuweisung des Leads', 4000)
     WHERE linked_type = 'lead' AND linked_id = l.id AND type = 'appointment'
       AND outcome IS NULL AND scheduled_at > now() AND owner_id <> p_owner_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF p_owner_id <> v_me THEN
      PERFORM app_private.notify(p_owner_id, 'lead_assigned', 'Lead zugewiesen: ' || app_private.lead_display_name(l),
                                 nullif(btrim(coalesce(p_reason, '')), ''), '/vertrieb/leads/' || l.id);
    END IF;
  END IF;
  RETURN jsonb_build_object('appointments_moved', v_moved);
END
$function$

;

CREATE OR REPLACE FUNCTION app_private.run_lead_task_generators()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_keep     uuid[];
  v_id       uuid;
  v_mgr      uuid;
  r          record;
  v_escalate boolean := coalesce((SELECT (value ->> 'escalate_to_manager')::boolean FROM public.app_settings WHERE key = 'lead_sla'), false);
  v_breaches integer := 0;
BEGIN
  -- lead_first_contact: owned, open, never contacted → owner; overdue → high + manager notified once
  v_keep := '{}';
  FOR r IN SELECT l.id, l.owner_id, l.sla_due_at, l.sla_escalated_at, app_private.lead_display_name(l) AS name
             FROM public.leads l JOIN public.lead_stages s ON s.code = l.stage
            WHERE l.owner_id IS NOT NULL AND l.first_contact_at IS NULL AND l.merged_into IS NULL AND s.kind = 'open' LOOP
    v_id := app_private.ensure_system_task('lead_first_contact', r.owner_id, 'Erstkontakt: ' || r.name,
              r.sla_due_at, 'lead', r.id, 'normal', '/vertrieb/leads/' || r.id);
    v_keep := array_append(v_keep, v_id);
    IF r.sla_due_at < now() THEN
      UPDATE public.tasks SET priority = 'high' WHERE id = v_id AND priority <> 'high';
      v_breaches := v_breaches + 1;
      v_mgr := app_private.active_manager_of(r.owner_id);
      -- Escalate each lead once (P4-NOTIF-01); a reassignment resets the marker.
      IF v_escalate AND v_mgr IS NOT NULL AND r.sla_escalated_at IS NULL THEN
        PERFORM app_private.notify(v_mgr, 'lead_sla_breach', 'Erstkontakt überfällig: ' || r.name, NULL, '/vertrieb/leads/' || r.id);
        UPDATE public.leads SET sla_escalated_at = now() WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
  PERFORM app_private.close_system_tasks('lead_first_contact', v_keep, 'Kontakt erfolgt oder Lead abgegeben');

  -- lead_next_action: contacted open/nurture leads without a next step (or with an overdue one),
  -- unless an appointment is already booked
  v_keep := '{}';
  FOR r IN SELECT l.id, l.owner_id, l.next_action, l.next_action_at, app_private.lead_display_name(l) AS name
             FROM public.leads l JOIN public.lead_stages s ON s.code = l.stage
            WHERE l.owner_id IS NOT NULL AND l.merged_into IS NULL AND s.kind IN ('open', 'nurture')
              AND l.first_contact_at IS NOT NULL
              AND (l.next_action_at IS NULL OR l.next_action_at < now())
              AND NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.linked_type = 'lead' AND a.linked_id = l.id
                                AND a.type = 'appointment' AND a.outcome IS NULL AND a.scheduled_at > now()) LOOP
    v_id := app_private.ensure_system_task('lead_next_action', r.owner_id,
              CASE WHEN r.next_action_at IS NULL THEN 'Nächsten Schritt festlegen: ' || r.name
                   ELSE left('Fällig: ' || coalesce(r.next_action, 'Nächster Schritt') || ' (' || r.name || ')', 300) END,
              coalesce(r.next_action_at, now()), 'lead', r.id, 'normal', '/vertrieb/leads/' || r.id);
    v_keep := array_append(v_keep, v_id);
  END LOOP;
  PERFORM app_private.close_system_tasks('lead_next_action', v_keep, 'Nächster Schritt geplant oder Lead geschlossen');

  -- lead_unassigned: pool leads → their creator if a leader, otherwise every active admin
  v_keep := '{}';
  FOR r IN SELECT l.id, l.sla_due_at, app_private.lead_display_name(l) AS name, t.recipient
             FROM public.leads l
             JOIN public.lead_stages s ON s.code = l.stage AND s.kind IN ('open', 'nurture')
             CROSS JOIN LATERAL (
               SELECT l.created_by AS recipient
                WHERE EXISTS (SELECT 1 FROM public.employees e WHERE e.id = l.created_by AND e.status = 'active')
                  AND EXISTS (SELECT 1 FROM app_private.descendants_at(l.created_by, app_private.business_today()))
               UNION
               SELECT e.id FROM public.employees e JOIN public.user_roles ur
                   ON ur.user_id = e.user_id AND ur.role = 'admin' AND ur.revoked_at IS NULL
                WHERE e.status = 'active'
                  AND NOT EXISTS (SELECT 1 FROM public.employees c WHERE c.id = l.created_by AND c.status = 'active'
                                    AND EXISTS (SELECT 1 FROM app_private.descendants_at(l.created_by, app_private.business_today())))
             ) t
            WHERE l.owner_id IS NULL AND l.merged_into IS NULL LOOP
    v_id := app_private.ensure_system_task('lead_unassigned', r.recipient, 'Lead zuweisen: ' || r.name,
              r.sla_due_at, 'lead', r.id, 'high', '/vertrieb/leads/' || r.id);
    v_keep := array_append(v_keep, v_id);
  END LOOP;
  PERFORM app_private.close_system_tasks('lead_unassigned', v_keep, 'Lead wurde zugewiesen');

  RETURN jsonb_build_object('lead_sla_breaches', v_breaches);
END
$function$

;

CREATE OR REPLACE FUNCTION app_private.lead_activity_effects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  l        public.leads%ROWTYPE;
  v_target text;
  v_cur    integer;
BEGIN
  IF NEW.linked_type IS DISTINCT FROM 'lead' THEN RETURN NEW; END IF;
  SELECT * INTO l FROM public.leads WHERE id = NEW.linked_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- First contact (P4-DATA-01): any attempt, call or e-mail, an offer, or an appointment
  -- (booking it means the lead was reached; a past slot counts from the slot).
  IF l.first_contact_at IS NULL AND NEW.type IN ('contact_attempt', 'call', 'email', 'offer', 'appointment') THEN
    UPDATE public.leads
       SET first_contact_at = CASE WHEN NEW.type = 'appointment'
                                   THEN least(NEW.created_at, coalesce(NEW.scheduled_at, NEW.created_at))
                                   ELSE NEW.occurred_at END
     WHERE id = l.id;
  END IF;

  v_target := CASE
    WHEN NEW.type = 'appointment' AND NEW.outcome = 'held' THEN 'appointment_held'
    WHEN NEW.type = 'appointment' AND NEW.outcome IS NULL THEN 'appointment_booked'
    WHEN NEW.type IN ('contact_attempt', 'call', 'email') AND NEW.outcome = 'reached' THEN 'contacted'
    WHEN NEW.type IN ('contact_attempt', 'call', 'email') THEN 'contact_attempted'
  END;
  IF v_target IS NULL OR l.owner_id IS NULL THEN RETURN NEW; END IF;

  SELECT position INTO v_cur FROM public.lead_stages WHERE code = l.stage AND kind = 'open';
  IF v_cur IS NOT NULL AND v_cur < (SELECT position FROM public.lead_stages WHERE code = v_target AND active) THEN
    PERFORM app_private.move_lead(l.id, v_target, true, 'Automatisch aus Aktivität');
  END IF;
  RETURN NEW;
END
$function$

;

-- The one-argument helpers have no callers left.
DROP FUNCTION IF EXISTS app_private.can_see_lead(uuid);
DROP FUNCTION IF EXISTS app_private.assert_can_write_lead(uuid);

-- ------------------------------------------------------------
-- P4-API-02: activities and tasks raise named keys
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_log_activity(p_type text, p_linked_type text DEFAULT NULL::text, p_linked_id uuid DEFAULT NULL::uuid, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_outcome text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_owner_id uuid DEFAULT NULL::uuid)
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
  IF p_type = 'appointment' AND p_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'appointment_time_required' USING ERRCODE = '22023';
  END IF;
  IF p_outcome IS NOT NULL AND NOT (
       (p_type IN ('contact_attempt', 'call', 'email') AND p_outcome IN ('reached', 'not_reached'))
    OR (p_type = 'appointment' AND p_outcome IN ('held', 'no_show', 'cancelled', 'rescheduled'))) THEN
    RAISE EXCEPTION 'outcome_not_allowed' USING ERRCODE = '22023';
  END IF;
  IF length(p_notes) > 4000 THEN RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023'; END IF;
  PERFORM app_private.check_activity_link(p_linked_type, p_linked_id, v_owner);
  INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, scheduled_at, outcome, notes, created_by)
  VALUES (v_owner, p_type, p_linked_type, p_linked_id, coalesce(p_occurred_at, now()), p_scheduled_at, p_outcome,
          nullif(btrim(coalesce(p_notes, '')), ''), v_me)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION app_rpc.rpc_create_task(p_owner_id uuid, p_title text, p_description text DEFAULT NULL::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_priority text DEFAULT 'normal'::text, p_linked_type text DEFAULT NULL::text, p_linked_id uuid DEFAULT NULL::uuid)
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
  IF length(btrim(coalesce(p_title, ''))) < 3 THEN RAISE EXCEPTION 'title_too_short' USING ERRCODE = '22023'; END IF;
  IF length(btrim(p_title)) > 300 OR length(p_description) > 4000 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
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

-- ------------------------------------------------------------
-- P4-UX-10: system tasks close themselves; a manager may dismiss one
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_rpc.rpc_set_task_status(p_task_id uuid, p_status text, p_note text DEFAULT NULL)
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
  IF t.source = 'system' THEN
    IF p_status <> 'cancelled' OR t.status <> 'open' THEN
      RAISE EXCEPTION 'system_task_auto' USING ERRCODE = 'P0001';
    END IF;
    IF NOT app_private.is_manager_of(t.owner_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    PERFORM app_private.require_reason(p_note);
    UPDATE public.tasks
       SET status = 'cancelled', dismissed = true, completed_at = now(), completion_note = btrim(p_note)
     WHERE id = p_task_id;
    RETURN;
  END IF;
  UPDATE public.tasks
     SET status = p_status,
         completed_at = CASE WHEN p_status = 'open' THEN NULL ELSE now() END,
         completion_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE id = p_task_id;
END
$$;

-- Idempotent system task; NULL when a manager dismissed it for this owner.
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
  IF EXISTS (SELECT 1 FROM public.tasks
              WHERE type = p_type AND linked_type = p_linked_type AND linked_id = p_linked_id AND owner_id = p_owner
                AND source = 'system' AND dismissed) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority)
  VALUES (p_owner, 'system', p_type, p_title, p_linked_type, p_linked_id, p_due, p_priority)
  RETURNING id INTO v_id;
  PERFORM app_private.notify(p_owner, p_type, p_title, NULL, p_link);
  RETURN v_id;
END
$$;

-- ------------------------------------------------------------
-- P4-NOTIF-01: digest while the generators run
-- ------------------------------------------------------------
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
  IF current_setting('app.notify_digest', true) = 'on' THEN
    INSERT INTO pg_temp.notify_digest AS d (recipient_id, kind, n, title, body, link, critical)
    VALUES (p_recipient, p_kind, 1, p_title, p_body, p_link, v_critical)
    ON CONFLICT (recipient_id, kind) DO UPDATE SET n = d.n + 1, critical = d.critical OR EXCLUDED.critical;
    RETURN;
  END IF;
  INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical)
  VALUES (p_recipient, p_kind, p_title, p_body, p_link, v_critical);
END
$$;

-- One notification per (recipient, kind): the original when there is one, a summary otherwise.
CREATE OR REPLACE FUNCTION app_private.flush_notification_digest()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r   record;
  v_n integer := 0;
  v_label text;
BEGIN
  FOR r IN SELECT * FROM pg_temp.notify_digest LOOP
    IF r.n = 1 THEN
      INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical)
      VALUES (r.recipient_id, r.kind, r.title, r.body, r.link, r.critical);
    ELSE
      v_label := CASE r.kind
        WHEN 'lead_first_contact' THEN 'Erstkontakt'
        WHEN 'lead_next_action' THEN 'Nächster Schritt'
        WHEN 'lead_unassigned' THEN 'Lead zuweisen'
        WHEN 'goal_review' THEN 'Zielfreigabe'
        WHEN 'coaching_action' THEN 'Maßnahme'
        WHEN 'coaching_review' THEN 'Coaching'
        WHEN 'career_period_end' THEN 'Karrierezeitraum'
        WHEN 'calculation_exception' THEN 'Prüffall'
        WHEN 'reassignment' THEN 'Übernommene Aufgaben'
        WHEN 'customer_service' THEN 'Kundenservice'
        WHEN 'customer_follow_up' THEN 'Kunde nachfassen'
        ELSE 'Aufgaben' END;
      INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical)
      VALUES (r.recipient_id, r.kind,
              CASE r.kind
                WHEN 'lead_sla_breach' THEN r.n || ' Erstkontakte im Team überfällig'
                WHEN 'lead_assigned' THEN r.n || ' Leads zugewiesen'
                ELSE v_label || ': ' || r.n || ' neue Einträge' END,
              left('u. a. ' || r.title, 500),
              CASE r.kind
                WHEN 'lead_sla_breach' THEN '/vertrieb/leads?ansicht=team&sla=overdue'
                WHEN 'lead_assigned' THEN '/vertrieb/leads'
                ELSE '/vertrieb/aufgaben' END,
              r.critical);
    END IF;
    v_n := v_n + 1;
  END LOOP;
  DELETE FROM pg_temp.notify_digest;
  RETURN v_n;
END
$$;

CREATE OR REPLACE FUNCTION app_private.run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auto      integer;
  v_leads     jsonb;
  v_customers jsonb;
  v_core      jsonb;
  v_sent      integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS notify_digest (
    recipient_id uuid NOT NULL, kind text NOT NULL, n integer NOT NULL, title text NOT NULL,
    body text, link text, critical boolean NOT NULL, PRIMARY KEY (recipient_id, kind)
  ) ON COMMIT DROP;
  PERFORM set_config('app.notify_digest', 'on', true);
  v_auto      := app_private.auto_assign_pool_leads();
  v_leads     := app_private.run_lead_task_generators();
  v_customers := app_private.run_customer_task_generators();
  v_core      := app_private.run_core_task_generators();
  PERFORM set_config('app.notify_digest', 'off', true);
  v_sent := app_private.flush_notification_digest();
  RETURN v_core || v_leads || v_customers || jsonb_build_object('auto_assigned', v_auto, 'notifications', v_sent);
END
$$;

-- ------------------------------------------------------------
-- Backfills
-- ------------------------------------------------------------
SELECT set_config('app.reason', 'Phase-4-Review: Datenbereinigung', true);

-- P4-DATA-03: '' → NULL (the trigger normalises on update)
UPDATE public.leads SET region = region
 WHERE region = '' OR campaign = '' OR referral = '' OR next_action = '';

-- P4-DATA-01: earliest contact-like activity becomes the first contact
UPDATE public.leads l
   SET first_contact_at = x.first_at
  FROM (SELECT a.linked_id,
               min(CASE WHEN a.type = 'appointment' THEN least(a.created_at, coalesce(a.scheduled_at, a.created_at))
                        ELSE a.occurred_at END) AS first_at
          FROM public.activities a
         WHERE a.linked_type = 'lead' AND a.type IN ('contact_attempt', 'call', 'email', 'offer', 'appointment')
         GROUP BY a.linked_id) x
 WHERE l.id = x.linked_id AND (l.first_contact_at IS NULL OR x.first_at < l.first_contact_at);

-- P4-NOTIF-01: leads that already escalated keep their marker
UPDATE public.leads l SET sla_escalated_at = n.created_at
  FROM (SELECT link, min(created_at) AS created_at FROM public.notifications WHERE kind = 'lead_sla_breach' GROUP BY link) n
 WHERE n.link = '/vertrieb/leads/' || l.id AND l.sla_escalated_at IS NULL;
