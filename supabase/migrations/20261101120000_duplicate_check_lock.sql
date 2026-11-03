-- ============================================================
-- Review round 2: duplicate checks under concurrency (P4-R2-06)
-- ============================================================
-- Two requests that create a lead (or customer) with the same phone or e-mail at
-- the same moment both passed the duplicate check, because neither saw the
-- other's uncommitted row. Each create now takes a transaction-level advisory
-- lock per phone and per e-mail (in a fixed order, so two requests can't
-- deadlock) before checking; the second request waits, sees the first row and
-- gets possible_duplicate unless it confirmed.
-- ============================================================

CREATE OR REPLACE FUNCTION app_rpc.rpc_create_lead(p_data jsonb, p_owner_id uuid DEFAULT NULL::uuid, p_to_pool boolean DEFAULT false, p_confirm_duplicates boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
  PERFORM pg_advisory_xact_lock(hashtextextended(k, 0))
     FROM (SELECT DISTINCT k FROM unnest(ARRAY[
             'lead:phone:' || nullif(btrim(p_data ->> 'phone'), ''),
             'lead:email:' || nullif(lower(btrim(p_data ->> 'email')), '')]) AS k
           WHERE k IS NOT NULL ORDER BY k) AS keys;
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
$function$

;

CREATE OR REPLACE FUNCTION app_rpc.rpc_create_customer(p_data jsonb, p_owner_id uuid DEFAULT NULL::uuid, p_confirm_duplicates boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_owner uuid := coalesce(p_owner_id, app_private.current_employee_id());
  c       public.customers%ROWTYPE;
BEGIN
  -- P5-UX-05: a follow-up planned by a user lies ahead (imports and data fixes write the table directly).
  IF (p_data ->> 'next_follow_up_at')::timestamptz < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'date_in_past' USING ERRCODE = '22023';
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM app_private.assert_can_write_customer(v_owner);
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_owner AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(k, 0))
     FROM (SELECT DISTINCT k FROM unnest(ARRAY[
             'customer:phone:' || nullif(btrim(p_data ->> 'phone'), ''),
             'customer:email:' || nullif(lower(btrim(p_data ->> 'email')), '')]) AS k
           WHERE k IS NOT NULL ORDER BY k) AS keys;
  IF NOT p_confirm_duplicates AND EXISTS (
    SELECT 1 FROM app_private.customer_duplicates(p_data ->> 'first_name', p_data ->> 'last_name', p_data ->> 'company',
                                                  p_data ->> 'phone', p_data ->> 'email')) THEN
    RAISE EXCEPTION 'possible_duplicate' USING ERRCODE = 'P0001';
  END IF;
  c.owner_id := v_owner;
  c.created_by := v_me;
  c.preferred_channel := 'any';
  c.status := 'active';
  c := app_private.apply_customer_data(c, p_data);
  PERFORM app_private.set_audit_context('Kunde angelegt');
  INSERT INTO public.customers (first_name, last_name, company, preferred_name, date_of_birth, phone, email, street, postal_code,
                                city, preferred_channel, owner_id, status, next_follow_up_at, notes, created_by)
  VALUES (c.first_name, c.last_name, c.company, c.preferred_name, c.date_of_birth, c.phone, c.email, c.street, c.postal_code,
          c.city, c.preferred_channel, c.owner_id, c.status, c.next_follow_up_at, c.notes, c.created_by)
  RETURNING * INTO c;
  INSERT INTO public.customer_assignments (customer_id, to_owner, assigned_by, reason) VALUES (c.id, v_owner, v_me, 'Angelegt');
  RETURN c.id;
END
$function$

;
