-- ============================================================
-- r1/p5/contract-links: contracts linked to customers, sync runs (§10.1, §10.4)
-- ============================================================
-- contract_links  one row per external contract: (source_system,
--                 external_contract_id) is unique, so manual entries and a
--                 later sync of the same contract never duplicate (§10.4
--                 "stable external IDs"). Policy dates are stored only with
--                 their origin: 'portal' (sync) or 'manual_confirmed'
--                 (someone confirmed them from the documents) — §10.3 "do
--                 not make unverified assumptions".
-- sync_runs / sync_errors
--                 every import run with counts; errors keep METADATA only
--                 (external ids + error code), never the raw payload.
-- rpc_ingest_contracts(source, rows)
--                 read-only intake for the future portal adapter
--                 (service_role only; the portal itself is OD-14).
-- Visibility follows the customer. Deep links must be https and, when
-- app_settings.contract_portal.hosts is set, point to one of those hosts.
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('contract_portal', jsonb_build_object('hosts', jsonb_build_array(), 'sources', jsonb_build_array('manual', 'portal')),
        'Vertragsportal: erlaubte Hosts für Deep Links und bekannte Quellsysteme (OD-14)')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  rows_total    integer NOT NULL DEFAULT 0,
  rows_ok       integer NOT NULL DEFAULT 0,
  rows_failed   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.sync_errors (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id               uuid NOT NULL REFERENCES public.sync_runs (id) ON DELETE CASCADE,
  row_no               integer NOT NULL,
  external_customer_id text CHECK (external_customer_id IS NULL OR length(external_customer_id) <= 200),
  external_contract_id text CHECK (external_contract_id IS NULL OR length(external_contract_id) <= 200),
  error_code           text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_errors_run ON public.sync_errors (run_id);

CREATE TABLE IF NOT EXISTS public.contract_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  source_system        text NOT NULL CHECK (source_system ~ '^[a-z][a-z0-9_]{1,40}$'),
  external_contract_id text NOT NULL CHECK (length(btrim(external_contract_id)) BETWEEN 1 AND 200),
  category_code        text REFERENCES public.product_categories (code),
  product_name         text CHECK (product_name IS NULL OR length(product_name) <= 200),
  insurer              text CHECK (insurer IS NULL OR length(insurer) <= 200),
  status               text NOT NULL DEFAULT 'unknown' CHECK (status IN ('pending', 'active', 'cancelled', 'ended', 'unknown')),
  start_date           date,
  end_date             date,
  renewal_date         date,
  date_source          text CHECK (date_source IN ('portal', 'manual_confirmed')),
  dates_confirmed_by   uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  deep_link            text CHECK (deep_link IS NULL OR (deep_link ~ '^https://[^\s/]+(/[^\s]*)?$' AND length(deep_link) <= 1000)),
  production_id        uuid REFERENCES public.production_records (id) ON DELETE SET NULL,
  last_synced_at       timestamptz,
  sync_run_id          uuid REFERENCES public.sync_runs (id) ON DELETE SET NULL,
  archived_at          timestamptz,
  created_by           uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_dates_need_source CHECK ((start_date IS NULL AND end_date IS NULL AND renewal_date IS NULL) OR date_source IS NOT NULL),
  CONSTRAINT contract_dates_order CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_links_external ON public.contract_links (source_system, external_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_links_customer ON public.contract_links (customer_id);

DROP TRIGGER IF EXISTS contract_links_touch ON public.contract_links;
CREATE TRIGGER contract_links_touch BEFORE UPDATE ON public.contract_links FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
SELECT app_private.attach_audit('public.contract_links', 'id', '{updated_at,last_synced_at,sync_run_id}');

ALTER TABLE public.contract_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_links_select ON public.contract_links;
CREATE POLICY contract_links_select ON public.contract_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id));
DROP POLICY IF EXISTS sync_runs_select ON public.sync_runs;
CREATE POLICY sync_runs_select ON public.sync_runs FOR SELECT TO authenticated USING (app_private.has_role('admin'));
DROP POLICY IF EXISTS sync_errors_select ON public.sync_errors;
CREATE POLICY sync_errors_select ON public.sync_errors FOR SELECT TO authenticated USING (app_private.has_role('admin'));

REVOKE ALL ON public.contract_links, public.sync_runs, public.sync_errors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contract_links, public.sync_runs, public.sync_errors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contract_links, public.sync_runs TO service_role;
GRANT SELECT, INSERT ON public.sync_errors TO service_role;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.check_deep_link(p_link text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hosts jsonb := (SELECT value -> 'hosts' FROM public.app_settings WHERE key = 'contract_portal');
  v_host  text;
BEGIN
  IF p_link IS NULL THEN RETURN; END IF;
  IF p_link !~ '^https://[^\s/]+(/[^\s]*)?$' THEN RAISE EXCEPTION 'invalid_deep_link' USING ERRCODE = '22023'; END IF;
  v_host := lower(substring(p_link FROM '^https://([^/:?#]+)'));
  IF jsonb_array_length(coalesce(v_hosts, '[]')) > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_hosts) h WHERE lower(h) = v_host) THEN
    RAISE EXCEPTION 'invalid_deep_link' USING ERRCODE = '22023';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_private.check_source_system(p_source text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_settings s, jsonb_array_elements_text(s.value -> 'sources') x
                  WHERE s.key = 'contract_portal' AND x = p_source) THEN
    RAISE EXCEPTION 'unknown_source_system' USING ERRCODE = '22023';
  END IF;
END
$$;

-- ------------------------------------------------------------
-- Manual maintenance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_save_contract_link(
  p_id uuid, p_customer_id uuid, p_data jsonb, p_dates_confirmed boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.customers%ROWTYPE;
  k        public.contract_links%ROWTYPE;
  v_id     uuid;
  v_start  date := (p_data ->> 'start_date')::date;
  v_end    date := (p_data ->> 'end_date')::date;
  v_renew  date := (p_data ->> 'renewal_date')::date;
  v_dates  boolean;
  v_source text := coalesce(nullif(btrim(p_data ->> 'source_system'), ''), 'manual');
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) x WHERE x NOT IN (
      'source_system', 'external_contract_id', 'category_code', 'product_name', 'insurer', 'status',
      'start_date', 'end_date', 'renewal_date', 'deep_link', 'production_id')) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO k FROM public.contract_links WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    -- Synced contracts belong to the source system; only the link to production can be set here.
    IF k.date_source = 'portal' OR k.last_synced_at IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) x WHERE x <> 'production_id') THEN
        RAISE EXCEPTION 'synced_read_only' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  SELECT * INTO c FROM public.customers WHERE id = coalesce(k.customer_id, p_customer_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);

  v_dates := v_start IS NOT NULL OR v_end IS NOT NULL OR v_renew IS NOT NULL;
  IF v_dates AND NOT p_dates_confirmed AND k.last_synced_at IS NULL THEN
    RAISE EXCEPTION 'dates_unconfirmed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.check_deep_link(nullif(btrim(p_data ->> 'deep_link'), ''));
  IF (p_data ->> 'production_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_records pr
     WHERE pr.id = (p_data ->> 'production_id')::uuid AND app_private.can_see_employee(pr.producer_id)) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app_private.set_audit_context('Vertrag verknüpft');
  IF p_id IS NULL THEN
    PERFORM app_private.check_source_system(v_source);
    IF EXISTS (SELECT 1 FROM public.contract_links WHERE source_system = v_source AND external_contract_id = btrim(p_data ->> 'external_contract_id')) THEN
      RAISE EXCEPTION 'contract_exists' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.contract_links (customer_id, source_system, external_contract_id, category_code, product_name, insurer, status,
                                       start_date, end_date, renewal_date, date_source, dates_confirmed_by, deep_link, production_id, created_by)
    VALUES (c.id, v_source, btrim(p_data ->> 'external_contract_id'), nullif(p_data ->> 'category_code', ''), p_data ->> 'product_name',
            p_data ->> 'insurer', coalesce(p_data ->> 'status', 'unknown'), v_start, v_end, v_renew,
            CASE WHEN v_dates THEN 'manual_confirmed' END, CASE WHEN v_dates THEN app_private.current_employee_id() END,
            nullif(btrim(p_data ->> 'deep_link'), ''), (p_data ->> 'production_id')::uuid, app_private.current_employee_id())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contract_links SET
      category_code = CASE WHEN p_data ? 'category_code' THEN nullif(p_data ->> 'category_code', '') ELSE category_code END,
      product_name = CASE WHEN p_data ? 'product_name' THEN p_data ->> 'product_name' ELSE product_name END,
      insurer = CASE WHEN p_data ? 'insurer' THEN p_data ->> 'insurer' ELSE insurer END,
      status = CASE WHEN p_data ? 'status' THEN coalesce(p_data ->> 'status', 'unknown') ELSE status END,
      start_date = CASE WHEN p_data ? 'start_date' THEN v_start ELSE start_date END,
      end_date = CASE WHEN p_data ? 'end_date' THEN v_end ELSE end_date END,
      renewal_date = CASE WHEN p_data ? 'renewal_date' THEN v_renew ELSE renewal_date END,
      date_source = CASE WHEN p_data ?| ARRAY['start_date', 'end_date', 'renewal_date'] AND k.date_source IS DISTINCT FROM 'portal'
                         THEN CASE WHEN v_dates THEN 'manual_confirmed' END ELSE date_source END,
      dates_confirmed_by = CASE WHEN p_data ?| ARRAY['start_date', 'end_date', 'renewal_date'] AND k.date_source IS DISTINCT FROM 'portal'
                         THEN CASE WHEN v_dates THEN app_private.current_employee_id() END ELSE dates_confirmed_by END,
      deep_link = CASE WHEN p_data ? 'deep_link' THEN nullif(btrim(p_data ->> 'deep_link'), '') ELSE deep_link END,
      production_id = CASE WHEN p_data ? 'production_id' THEN (p_data ->> 'production_id')::uuid ELSE production_id END
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_archive_contract_link(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT c.owner_id INTO v_owner FROM public.contract_links k JOIN public.customers c ON c.id = k.customer_id WHERE k.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM app_private.assert_can_write_customer(v_owner);
  PERFORM app_private.require_reason(p_reason);
  UPDATE public.contract_links SET archived_at = now() WHERE id = p_id AND archived_at IS NULL;
END
$$;

-- The customer's id in an external system (needed to match synced contracts).
CREATE OR REPLACE FUNCTION public.rpc_link_customer_external(p_customer_id uuid, p_source_system text, p_external_id text)
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
  IF p_source_system IS NOT NULL THEN PERFORM app_private.check_source_system(p_source_system); END IF;
  IF p_external_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers WHERE source_system = p_source_system AND external_id = btrim(p_external_id) AND id <> c.id) THEN
    RAISE EXCEPTION 'external_id_taken' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.set_audit_context('Externe Kundennummer');
  UPDATE public.customers
     SET source_system = CASE WHEN nullif(btrim(p_external_id), '') IS NULL THEN NULL ELSE p_source_system END,
         external_id = nullif(btrim(p_external_id), '')
   WHERE id = c.id;
END
$$;

-- ------------------------------------------------------------
-- Sync intake (read-only from the portal's side)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_ingest_contracts(p_source_system text, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run    uuid;
  v_row    jsonb;
  v_no     integer := 0;
  v_ok     integer := 0;
  v_failed integer := 0;
  v_cust   uuid;
  v_code   text;
BEGIN
  PERFORM app_private.check_source_system(p_source_system);
  IF p_source_system = 'manual' THEN RAISE EXCEPTION 'unknown_source_system' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 10000 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.set_audit_context('Vertragssynchronisation ' || p_source_system);
  INSERT INTO public.sync_runs (source_system, rows_total) VALUES (p_source_system, jsonb_array_length(p_rows)) RETURNING id INTO v_run;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_no := v_no + 1;
    v_code := NULL;
    SELECT id INTO v_cust FROM public.customers
     WHERE source_system = p_source_system AND external_id = v_row ->> 'external_customer_id' AND erased_at IS NULL;
    IF v_cust IS NULL THEN
      v_code := 'customer_not_found';
    ELSIF coalesce(btrim(v_row ->> 'external_contract_id'), '') = '' THEN
      v_code := 'contract_id_missing';
    ELSE
      BEGIN
        PERFORM app_private.check_deep_link(nullif(btrim(v_row ->> 'deep_link'), ''));
        INSERT INTO public.contract_links AS k (customer_id, source_system, external_contract_id, category_code, product_name, insurer,
                                                status, start_date, end_date, renewal_date, date_source, deep_link, last_synced_at, sync_run_id)
        VALUES (v_cust, p_source_system, btrim(v_row ->> 'external_contract_id'), nullif(v_row ->> 'category_code', ''),
                v_row ->> 'product_name', v_row ->> 'insurer', coalesce(v_row ->> 'status', 'unknown'),
                (v_row ->> 'start_date')::date, (v_row ->> 'end_date')::date, (v_row ->> 'renewal_date')::date,
                CASE WHEN coalesce(v_row ->> 'start_date', v_row ->> 'end_date', v_row ->> 'renewal_date') IS NOT NULL THEN 'portal' END,
                nullif(btrim(v_row ->> 'deep_link'), ''), now(), v_run)
        ON CONFLICT (source_system, external_contract_id) DO UPDATE SET
          customer_id = EXCLUDED.customer_id, category_code = EXCLUDED.category_code, product_name = EXCLUDED.product_name,
          insurer = EXCLUDED.insurer, status = EXCLUDED.status, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
          renewal_date = EXCLUDED.renewal_date, date_source = EXCLUDED.date_source, dates_confirmed_by = NULL,
          deep_link = EXCLUDED.deep_link, last_synced_at = now(), sync_run_id = v_run;
        UPDATE public.customers SET last_synced_at = now() WHERE id = v_cust;
      EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow THEN v_code := 'invalid_date';
        WHEN foreign_key_violation THEN v_code := 'unknown_category';
        WHEN check_violation THEN v_code := 'invalid_value';
        WHEN invalid_parameter_value THEN v_code := 'invalid_deep_link';
      END;
    END IF;
    IF v_code IS NULL THEN
      v_ok := v_ok + 1;
    ELSE
      v_failed := v_failed + 1;
      INSERT INTO public.sync_errors (run_id, row_no, external_customer_id, external_contract_id, error_code)
      VALUES (v_run, v_no, left(v_row ->> 'external_customer_id', 200), left(v_row ->> 'external_contract_id', 200), v_code);
    END IF;
  END LOOP;

  UPDATE public.sync_runs
     SET finished_at = now(), rows_ok = v_ok, rows_failed = v_failed,
         status = CASE WHEN v_failed = 0 THEN 'succeeded' WHEN v_ok = 0 THEN 'failed' ELSE 'partial' END
   WHERE id = v_run;
  RETURN jsonb_build_object('run_id', v_run, 'ok', v_ok, 'failed', v_failed);
END
$$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_save_contract_link(uuid, uuid, jsonb, boolean), public.rpc_archive_contract_link(uuid, text),
  public.rpc_link_customer_external(uuid, text, text), public.rpc_ingest_contracts(text, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.rpc_save_contract_link(uuid, uuid, jsonb, boolean), public.rpc_archive_contract_link(uuid, text),
  public.rpc_link_customer_external(uuid, text, text)
TO authenticated;
-- Only the sync adapter (Edge Function with the service role) ingests.
GRANT EXECUTE ON FUNCTION public.rpc_ingest_contracts(text, jsonb) TO service_role;
