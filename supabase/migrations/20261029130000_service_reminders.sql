-- ============================================================
-- r1/p5/service-reminders: customer service items → tasks (§10.3, §11.2)
-- ============================================================
-- customer_service_items  agreed reviews, pending documents, follow-up after
--                         advice, contract renewals, other legitimate service
--                         events. Responsible owner, due date, optional
--                         yearly recurrence.
-- Contract renewals use ONLY a confirmed renewal date of a linked contract
-- (portal or confirmed from documents, see contract_links.date_source):
-- the due date is computed from it, never typed in (§10.3 "do not make
-- unverified assumptions about policy anniversaries").
-- Tasks: items due within app_settings.customer_service.lead_days (default
-- 14) create ONE 'customer_service' task per customer and owner. Customer
-- follow-ups (customers.next_follow_up_at) move to their own task type
-- 'customer_follow_up' so the two never close each other's tasks.
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('customer_service', jsonb_build_object('lead_days', 14), 'Kundenservice: Vorlauf in Tagen für Aufgaben')
ON CONFLICT (key) DO NOTHING;

-- New task type for customer follow-ups.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check CHECK (type IN (
  'manual', 'goal_review', 'coaching_action', 'coaching_review', 'career_period_end',
  'calculation_exception', 'lead_first_contact', 'lead_next_action', 'lead_unassigned',
  'customer_service', 'customer_follow_up', 'subsidy_review'));
UPDATE public.tasks SET type = 'customer_follow_up' WHERE type = 'customer_service' AND title LIKE 'Kunde nachfassen:%';

CREATE TABLE IF NOT EXISTS public.customer_service_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('annual_review', 'pending_documents', 'follow_up_after_advice', 'contract_renewal', 'other')),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  due_on           date NOT NULL,
  owner_id         uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  recurrence       text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'yearly')),
  contract_link_id uuid REFERENCES public.contract_links (id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  note             text CHECK (note IS NULL OR length(note) <= 2000),
  completed_at     timestamptz,
  completed_by     uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  previous_id      uuid REFERENCES public.customer_service_items (id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_item_completed CHECK ((status = 'open') = (completed_at IS NULL)),
  CONSTRAINT service_item_renewal_contract CHECK (kind <> 'contract_renewal' OR contract_link_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_service_items_due ON public.customer_service_items (status, due_on);
CREATE INDEX IF NOT EXISTS idx_service_items_customer ON public.customer_service_items (customer_id);

DROP TRIGGER IF EXISTS service_items_touch ON public.customer_service_items;
CREATE TRIGGER service_items_touch BEFORE UPDATE ON public.customer_service_items FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.customer_service_items', 'id', '{updated_at}', '{note}');

ALTER TABLE public.customer_service_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_items_select ON public.customer_service_items;
CREATE POLICY service_items_select ON public.customer_service_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id));
REVOKE ALL ON public.customer_service_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_service_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_service_items TO service_role;

-- First anniversary of p_date on or after p_from (29 Feb → 28 Feb in other years).
CREATE OR REPLACE FUNCTION app_private.next_anniversary(p_date date, p_from date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_date >= p_from THEN p_date ELSE (
    SELECT (p_date + make_interval(years => n))::date
      FROM generate_series(1, 200) n
     WHERE (p_date + make_interval(years => n))::date >= p_from
     ORDER BY n LIMIT 1) END
$$;

-- Due date of a renewal item: next anniversary of the confirmed renewal date.
CREATE OR REPLACE FUNCTION app_private.renewal_due(p_contract_id uuid, p_customer_id uuid, p_from date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k public.contract_links%ROWTYPE;
BEGIN
  SELECT * INTO k FROM public.contract_links WHERE id = p_contract_id;
  IF NOT FOUND OR k.customer_id <> p_customer_id THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF k.renewal_date IS NULL OR k.date_source IS NULL THEN
    RAISE EXCEPTION 'renewal_date_unconfirmed' USING ERRCODE = 'P0001';
  END IF;
  RETURN app_private.next_anniversary(k.renewal_date, p_from);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_save_service_item(
  p_id uuid, p_customer_id uuid, p_kind text, p_title text, p_due_on date, p_owner_id uuid DEFAULT NULL,
  p_recurrence text DEFAULT 'none', p_contract_link_id uuid DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c      public.customers%ROWTYPE;
  i      public.customer_service_items%ROWTYPE;
  v_due  date := p_due_on;
  v_own  uuid;
  v_id   uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO i FROM public.customer_service_items WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    IF i.status <> 'open' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  END IF;
  SELECT * INTO c FROM public.customers WHERE id = coalesce(i.customer_id, p_customer_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);

  v_own := coalesce(p_owner_id, i.owner_id, c.owner_id);
  IF v_own <> c.owner_id AND NOT (v_own = app_private.current_employee_id() OR app_private.is_manager_of(v_own)
                                  OR (app_private.has_role('admin') AND app_private.is_aal2())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_own AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind = 'contract_renewal' THEN
    v_due := app_private.renewal_due(p_contract_link_id, c.id, app_private.business_today());
  ELSIF p_contract_link_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_links WHERE id = p_contract_link_id AND customer_id = c.id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_due IS NULL THEN RAISE EXCEPTION 'date_required' USING ERRCODE = '22023'; END IF;
  IF v_due > app_private.business_today() + 3660 THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;

  PERFORM app_private.set_audit_context('Serviceanlass gepflegt');
  IF p_id IS NULL THEN
    INSERT INTO public.customer_service_items (customer_id, kind, title, due_on, owner_id, recurrence, contract_link_id, note, created_by)
    VALUES (c.id, p_kind, btrim(p_title), v_due, v_own, coalesce(p_recurrence, 'none'), p_contract_link_id,
            nullif(btrim(coalesce(p_note, '')), ''), app_private.current_employee_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.customer_service_items
       SET kind = p_kind, title = btrim(p_title), due_on = v_due, owner_id = v_own, recurrence = coalesce(p_recurrence, 'none'),
           contract_link_id = p_contract_link_id, note = nullif(btrim(coalesce(p_note, '')), '')
     WHERE id = p_id
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END
$$;

-- Done / cancelled. A yearly item creates its next occurrence when done.
CREATE OR REPLACE FUNCTION public.rpc_set_service_item_status(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  i      public.customer_service_items%ROWTYPE;
  v_own  uuid;
  v_next date;
  v_new  uuid;
BEGIN
  SELECT * INTO i FROM public.customer_service_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT owner_id INTO v_own FROM public.customers WHERE id = i.customer_id;
  -- The item's owner may close it even if the customer belongs to someone else.
  IF i.owner_id <> coalesce(app_private.current_employee_id(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM app_private.assert_can_write_customer(v_own);
  END IF;
  IF i.status <> 'open' OR p_status NOT IN ('done', 'cancelled') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.set_audit_context(CASE p_status WHEN 'done' THEN 'Serviceanlass erledigt' ELSE 'Serviceanlass abgesagt' END);
  UPDATE public.customer_service_items
     SET status = p_status, completed_at = now(), completed_by = app_private.current_employee_id(),
         note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
   WHERE id = p_id;

  IF p_status = 'done' AND i.recurrence = 'yearly' THEN
    IF i.kind = 'contract_renewal' THEN
      BEGIN
        v_next := app_private.renewal_due(i.contract_link_id, i.customer_id, i.due_on + 1);
      EXCEPTION WHEN OTHERS THEN
        v_next := NULL; -- contract gone or date no longer confirmed: no assumption, no next item
      END;
    ELSE
      v_next := (i.due_on + interval '1 year')::date;
    END IF;
    IF v_next IS NOT NULL THEN
      INSERT INTO public.customer_service_items (customer_id, kind, title, due_on, owner_id, recurrence, contract_link_id, previous_id, created_by)
      VALUES (i.customer_id, i.kind, i.title, v_next, i.owner_id, 'yearly', i.contract_link_id, i.id, app_private.current_employee_id())
      RETURNING id INTO v_new;
    END IF;
  END IF;
  RETURN v_new;
END
$$;

-- ------------------------------------------------------------
-- Task generation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.run_customer_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_keep  uuid[] := '{}';
  v_keep2 uuid[] := '{}';
  v_id    uuid;
  r       record;
  v_lead  integer := coalesce((SELECT (value ->> 'lead_days')::integer FROM public.app_settings WHERE key = 'customer_service'), 14);
BEGIN
  -- follow-ups
  FOR r IN SELECT c.id, c.owner_id, c.next_follow_up_at,
                  coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), c.company, 'Kunde') AS name
             FROM public.customers c
            WHERE c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at < now() + interval '1 day'
              AND c.archived_at IS NULL AND c.erased_at IS NULL LOOP
    v_id := app_private.ensure_system_task('customer_follow_up', r.owner_id, 'Kunde nachfassen: ' || r.name,
              r.next_follow_up_at, 'customer', r.id, 'normal', '/vertrieb/kunden/' || r.id);
    v_keep := array_append(v_keep, v_id);
  END LOOP;
  PERFORM app_private.close_system_tasks('customer_follow_up', v_keep, 'Nachfassen neu geplant oder erledigt');

  -- service items: one task per customer and owner
  FOR r IN SELECT i.customer_id, i.owner_id, min(i.due_on) AS due, count(*) AS n, min(i.title) AS title,
                  coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), c.company, 'Kunde') AS name
             FROM public.customer_service_items i JOIN public.customers c ON c.id = i.customer_id
            WHERE i.status = 'open' AND i.due_on <= app_private.business_today() + v_lead
              AND c.archived_at IS NULL AND c.erased_at IS NULL
            GROUP BY i.customer_id, i.owner_id, c.first_name, c.last_name, c.company LOOP
    v_id := app_private.ensure_system_task('customer_service', r.owner_id,
              left(CASE WHEN r.n = 1 THEN 'Service: ' || r.title || ' – ' || r.name ELSE r.n || ' Serviceanlässe – ' || r.name END, 300),
              r.due::timestamptz, 'customer', r.customer_id,
              CASE WHEN r.due < app_private.business_today() THEN 'high' ELSE 'normal' END, '/vertrieb/kunden/' || r.customer_id);
    v_keep2 := array_append(v_keep2, v_id);
  END LOOP;
  PERFORM app_private.close_system_tasks('customer_service', v_keep2, 'Serviceanlass erledigt oder verschoben');

  RETURN jsonb_build_object('customer_follow_ups', cardinality(v_keep), 'customer_service', cardinality(v_keep2));
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_save_service_item(uuid, uuid, text, text, date, uuid, text, uuid, text),
  public.rpc_set_service_item_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_service_item(uuid, uuid, text, text, date, uuid, text, uuid, text),
  public.rpc_set_service_item_status(uuid, text, text) TO authenticated;
