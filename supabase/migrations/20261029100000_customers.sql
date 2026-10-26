-- ============================================================
-- r1/p5/customers: central customer list (§10.1, §13)
-- ============================================================
-- customers             identity, contact, preferred channel, responsible
--                       adviser (owner), relationship status, source lead,
--                       external system id, next follow-up. PII is redacted
--                       in the audit log.
-- customer_assignments  append-only adviser history with reason.
--
-- Visibility (OD-13, provisional): the adviser, the adviser's managers,
-- admins and compliance (read-only, §12.1). Finance has no customer access.
-- Writes only through RPCs; admins need MFA unless they are owner/manager.
-- Customers are never deleted: archived (soft) or, in privacy-ops,
-- pseudonymised.
--
-- Lead conversion (§9.1 Conversion, §14.5): rpc_convert_lead creates the
-- customer from the lead's identity, links both ways and closes an open lead
-- as won. Activities can now be linked to customers.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_no       bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  first_name        text CHECK (first_name IS NULL OR length(first_name) <= 100),
  last_name         text CHECK (last_name IS NULL OR length(last_name) <= 100),
  company           text CHECK (company IS NULL OR length(company) <= 200),
  preferred_name    text CHECK (preferred_name IS NULL OR length(preferred_name) <= 100),
  date_of_birth     date CHECK (date_of_birth IS NULL OR date_of_birth BETWEEN '1900-01-01' AND current_date),
  phone             text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  email             text CHECK (email IS NULL OR (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  street            text CHECK (street IS NULL OR length(street) <= 200),
  postal_code       text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9A-Za-z \-]{3,10}$'),
  city              text CHECK (city IS NULL OR length(city) <= 100),
  preferred_channel text NOT NULL DEFAULT 'any' CHECK (preferred_channel IN ('any', 'phone', 'email', 'whatsapp', 'in_person', 'letter')),
  owner_id          uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('prospect', 'active', 'inactive', 'former')),
  lead_id           uuid UNIQUE REFERENCES public.leads (id) ON DELETE SET NULL,
  source_system     text CHECK (source_system IS NULL OR source_system ~ '^[a-z][a-z0-9_]{1,40}$'),
  external_id       text CHECK (external_id IS NULL OR length(external_id) <= 200),
  last_synced_at    timestamptz,
  next_follow_up_at timestamptz,
  notes             text CHECK (notes IS NULL OR length(notes) <= 4000),
  search_name       text GENERATED ALWAYS AS (
                      lower(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(company, '')))) STORED,
  archived_at       timestamptz,
  erased_at         timestamptz,
  created_by        uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_external_pair CHECK ((source_system IS NULL) = (external_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_external ON public.customers (source_system, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_owner ON public.customers (owner_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin (search_name extensions.gin_trgm_ops);

-- The lead side of the conversion link (column reserved in r1/p4/leads).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_customer_fk') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_customer_fk FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.customer_assignments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  from_owner  uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  to_owner    uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  reason      text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_assignments ON public.customer_assignments (customer_id, assigned_at);

DROP TRIGGER IF EXISTS customer_assignments_append_only ON public.customer_assignments;
CREATE TRIGGER customer_assignments_append_only BEFORE UPDATE OR DELETE ON public.customer_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();
DROP TRIGGER IF EXISTS customers_touch ON public.customers;
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.customers', 'id', '{updated_at,search_name}',
  '{first_name,last_name,company,preferred_name,date_of_birth,phone,email,street,postal_code,city,notes}');

CREATE OR REPLACE FUNCTION app_private.validate_customer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.first_name     := nullif(btrim(NEW.first_name), '');
  NEW.last_name      := nullif(btrim(NEW.last_name), '');
  NEW.company        := nullif(btrim(NEW.company), '');
  NEW.preferred_name := nullif(btrim(NEW.preferred_name), '');
  NEW.phone          := nullif(btrim(NEW.phone), '');
  NEW.email          := nullif(lower(btrim(NEW.email)), '');
  NEW.street         := nullif(btrim(NEW.street), '');
  NEW.postal_code    := nullif(btrim(NEW.postal_code), '');
  NEW.city           := nullif(btrim(NEW.city), '');
  NEW.notes          := nullif(btrim(NEW.notes), '');
  IF NEW.erased_at IS NULL AND NEW.last_name IS NULL AND NEW.company IS NULL THEN
    RAISE EXCEPTION 'customer_name_required' USING ERRCODE = '22023';
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF NEW.date_of_birth IS NOT NULL AND (NEW.date_of_birth > current_date OR NEW.date_of_birth < '1900-01-01') THEN
    RAISE EXCEPTION 'invalid_date_of_birth' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.erased_at IS NOT NULL AND (NEW.erased_at IS NULL OR NEW.first_name IS NOT NULL
       OR NEW.last_name IS DISTINCT FROM OLD.last_name OR NEW.phone IS NOT NULL OR NEW.email IS NOT NULL) THEN
    RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS customers_validate ON public.customers;
CREATE TRIGGER customers_validate BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION app_private.validate_customer();

-- ------------------------------------------------------------
-- Permissions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_see_customer(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_owner)
      OR app_private.has_role('admin') OR app_private.has_role('compliance')
$$;

CREATE OR REPLACE FUNCTION app_private.assert_can_write_customer(p_owner uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NOT NULL
     AND (p_owner = app_private.current_employee_id() OR app_private.is_manager_of(p_owner)) THEN
    RETURN;
  END IF;
  IF app_private.has_role('admin') THEN
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
    RETURN;
  END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END
$$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated USING (app_private.can_see_customer(owner_id));
DROP POLICY IF EXISTS customer_assignments_select ON public.customer_assignments;
CREATE POLICY customer_assignments_select ON public.customer_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id));

REVOKE ALL ON public.customers, public.customer_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customers, public.customer_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers TO service_role;
GRANT SELECT, INSERT ON public.customer_assignments TO service_role;
GRANT EXECUTE ON FUNCTION app_private.can_see_customer(uuid) TO authenticated;

-- Activities can be linked to customers now.
CREATE OR REPLACE FUNCTION app_private.check_activity_link(p_linked_type text, p_linked_id uuid, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
  PERFORM app_private.assert_can_write_lead(l.owner_id);
END
$$;

-- ------------------------------------------------------------
-- Duplicates (§9.5 applies to customers as well)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.customer_duplicates(
  p_first text, p_last text, p_company text, p_phone text, p_email text, p_exclude uuid DEFAULT NULL
)
RETURNS TABLE (customer_id uuid, owner_id uuid, reason text, score real)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH q AS (
    SELECT lower(btrim(coalesce(btrim(p_first), '') || ' ' || coalesce(btrim(p_last), '') || ' ' || coalesce(btrim(p_company), ''))) AS name,
           nullif(btrim(p_phone), '') AS phone, nullif(lower(btrim(p_email)), '') AS email
  )
  SELECT c.id, c.owner_id,
         CASE WHEN q.phone IS NOT NULL AND c.phone = q.phone THEN 'phone'
              WHEN q.email IS NOT NULL AND c.email = q.email THEN 'email'
              ELSE 'name' END,
         CASE WHEN (q.phone IS NOT NULL AND c.phone = q.phone) OR (q.email IS NOT NULL AND c.email = q.email) THEN 1::real
              ELSE extensions.similarity(c.search_name, q.name) END
    FROM public.customers c, q
   WHERE c.erased_at IS NULL
     AND (p_exclude IS NULL OR c.id <> p_exclude)
     AND ((q.phone IS NOT NULL AND c.phone = q.phone)
       OR (q.email IS NOT NULL AND c.email = q.email)
       OR (length(q.name) >= 5 AND extensions.similarity(c.search_name, q.name) >= 0.5))
   ORDER BY 4 DESC, c.created_at DESC
   LIMIT 10
$$;

CREATE OR REPLACE FUNCTION public.rpc_find_customer_duplicates(
  p_first_name text, p_last_name text, p_company text, p_phone text, p_email text, p_exclude uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', CASE WHEN v.visible THEN d.customer_id END,
             'customer_no', CASE WHEN v.visible THEN c.customer_no END,
             'name', CASE WHEN v.visible THEN btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.company, '')) END,
             'owner', e.first_name || ' ' || e.last_name,
             'reason', d.reason, 'visible', v.visible) ORDER BY d.score DESC)
      FROM app_private.customer_duplicates(p_first_name, p_last_name, p_company, p_phone, p_email, p_exclude) d
      JOIN public.customers c ON c.id = d.customer_id
      JOIN public.employees e ON e.id = d.owner_id
      CROSS JOIN LATERAL (SELECT app_private.can_see_customer(d.owner_id) AS visible) v), '[]'::jsonb);
END
$$;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.apply_customer_data(c public.customers, p jsonb)
RETURNS public.customers
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN (
      'first_name', 'last_name', 'company', 'preferred_name', 'date_of_birth', 'phone', 'email', 'street', 'postal_code',
      'city', 'preferred_channel', 'status', 'next_follow_up_at', 'notes')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p ? 'first_name' THEN c.first_name := p ->> 'first_name'; END IF;
  IF p ? 'last_name' THEN c.last_name := p ->> 'last_name'; END IF;
  IF p ? 'company' THEN c.company := p ->> 'company'; END IF;
  IF p ? 'preferred_name' THEN c.preferred_name := p ->> 'preferred_name'; END IF;
  IF p ? 'date_of_birth' THEN c.date_of_birth := (p ->> 'date_of_birth')::date; END IF;
  IF p ? 'phone' THEN c.phone := p ->> 'phone'; END IF;
  IF p ? 'email' THEN c.email := p ->> 'email'; END IF;
  IF p ? 'street' THEN c.street := p ->> 'street'; END IF;
  IF p ? 'postal_code' THEN c.postal_code := p ->> 'postal_code'; END IF;
  IF p ? 'city' THEN c.city := p ->> 'city'; END IF;
  IF p ? 'preferred_channel' THEN c.preferred_channel := coalesce(p ->> 'preferred_channel', 'any'); END IF;
  IF p ? 'status' THEN c.status := coalesce(p ->> 'status', 'active'); END IF;
  IF p ? 'next_follow_up_at' THEN c.next_follow_up_at := (p ->> 'next_follow_up_at')::timestamptz; END IF;
  IF p ? 'notes' THEN c.notes := p ->> 'notes'; END IF;
  RETURN c;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_customer(p_data jsonb, p_owner_id uuid DEFAULT NULL, p_confirm_duplicates boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := app_private.current_employee_id();
  v_owner uuid := coalesce(p_owner_id, app_private.current_employee_id());
  c       public.customers%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM app_private.assert_can_write_customer(v_owner);
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = v_owner AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_customer(p_customer_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.customers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);
  c := app_private.apply_customer_data(c, p_data);
  PERFORM app_private.set_audit_context('Kunde bearbeitet');
  UPDATE public.customers SET
    first_name = c.first_name, last_name = c.last_name, company = c.company, preferred_name = c.preferred_name,
    date_of_birth = c.date_of_birth, phone = c.phone, email = c.email, street = c.street, postal_code = c.postal_code,
    city = c.city, preferred_channel = c.preferred_channel, status = c.status, next_follow_up_at = c.next_follow_up_at, notes = c.notes
  WHERE id = p_customer_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_assign_customer(p_customer_id uuid, p_owner_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := app_private.current_employee_id();
  c    public.customers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);
  IF p_owner_id IS NULL OR p_owner_id = c.owner_id THEN RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001'; END IF;
  -- Target: yourself or someone in your structure; admins anyone (MFA).
  IF NOT (p_owner_id = v_me OR app_private.is_manager_of(p_owner_id)) THEN
    IF NOT app_private.has_role('admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF NOT app_private.is_aal2() THEN RAISE EXCEPTION 'mfa_required' USING ERRCODE = '42501'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'owner_inactive' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.require_reason(p_reason);
  UPDATE public.customers SET owner_id = p_owner_id WHERE id = c.id;
  INSERT INTO public.customer_assignments (customer_id, from_owner, to_owner, assigned_by, reason)
  VALUES (c.id, c.owner_id, p_owner_id, v_me, btrim(p_reason));
  IF p_owner_id <> coalesce(v_me, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM app_private.notify(p_owner_id, 'customer_assigned',
      'Kunde übernommen: ' || coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), c.company),
      btrim(p_reason), '/vertrieb/kunden/' || c.id);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_archive_customer(p_customer_id uuid, p_archived boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.customers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);
  IF (c.archived_at IS NOT NULL) = p_archived THEN RAISE EXCEPTION 'no_change' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.require_reason(p_reason);
  UPDATE public.customers SET archived_at = CASE WHEN p_archived THEN now() END WHERE id = c.id;
END
$$;

-- Lead → customer (§9.1 Conversion). The customer keeps the lead's identity,
-- adviser and a link to the lead (and so to its source and activities).
CREATE OR REPLACE FUNCTION public.rpc_convert_lead(p_lead_id uuid, p_confirm_duplicates boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  PERFORM app_private.assert_can_write_lead(l.owner_id);

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
$$;

-- Follow-up dates on customers create tasks (same engine as leads).
CREATE OR REPLACE FUNCTION app_private.run_customer_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_keep uuid[] := '{}';
  v_id   uuid;
  r      record;
BEGIN
  FOR r IN SELECT c.id, c.owner_id, c.next_follow_up_at,
                  coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), c.company, 'Kunde') AS name
             FROM public.customers c
            WHERE c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at < now() + interval '1 day'
              AND c.archived_at IS NULL AND c.erased_at IS NULL LOOP
    v_id := app_private.ensure_system_task('customer_service', r.owner_id, 'Kunde nachfassen: ' || r.name,
              r.next_follow_up_at, 'customer', r.id, 'normal', '/vertrieb/kunden/' || r.id);
    v_keep := array_append(v_keep, v_id);
  END LOOP;
  -- Only close follow-up tasks of this generator (service dates add their own later).
  UPDATE public.tasks SET status = 'cancelled', completed_at = now(), completion_note = 'Nachfassen neu geplant oder erledigt'
   WHERE type = 'customer_service' AND source = 'system' AND status = 'open' AND linked_type = 'customer'
     AND NOT (id = ANY (v_keep));
  RETURN jsonb_build_object('customer_follow_ups', cardinality(v_keep));
END
$$;

CREATE OR REPLACE FUNCTION app_private.run_task_generators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_leads     jsonb := app_private.run_lead_task_generators();
  v_customers jsonb := app_private.run_customer_task_generators();
BEGIN
  RETURN app_private.run_core_task_generators() || v_leads || v_customers;
END
$$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_find_customer_duplicates(text, text, text, text, text, uuid),
  public.rpc_create_customer(jsonb, uuid, boolean),
  public.rpc_update_customer(uuid, jsonb),
  public.rpc_assign_customer(uuid, uuid, text),
  public.rpc_archive_customer(uuid, boolean, text),
  public.rpc_convert_lead(uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_find_customer_duplicates(text, text, text, text, text, uuid),
  public.rpc_create_customer(jsonb, uuid, boolean),
  public.rpc_update_customer(uuid, jsonb),
  public.rpc_assign_customer(uuid, uuid, text),
  public.rpc_archive_customer(uuid, boolean, text),
  public.rpc_convert_lead(uuid, boolean)
TO authenticated;
