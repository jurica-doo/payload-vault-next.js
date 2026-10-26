-- ============================================================
-- r1/p5/consent: consents, legal basis, opt-out (§10.1, §10.5, §12.3)
-- ============================================================
-- customer_consents  append-only event log per customer and purpose:
--                    granted (with legal basis, source, evidence) or
--                    withdrawn. The current state is the latest event per
--                    purpose (by effective time). Corrections are new
--                    events, never edits.
-- purpose 'all'      the global opt-out ("keine Kontaktaufnahme"):
--                    opt_out / opt_in. An opt-out overrides every consent.
-- app_private.may_contact(customer, purpose)
--                    the single check Phase 6 (email engine) and any other
--                    sender must call at send time: active customer, no
--                    opt-out, address present, current legal basis.
-- Lead conversion copies the lead's recorded basis as contact consents.
-- Visibility follows the customer (adviser, managers, admin, compliance).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_consents (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  purpose      text NOT NULL CHECK (purpose IN (
                 'all', 'contact_phone', 'contact_email', 'contact_whatsapp', 'marketing_email', 'birthday_email', 'holiday_email')),
  action       text NOT NULL CHECK (action IN ('granted', 'withdrawn', 'opt_out', 'opt_in')),
  legal_basis  text CHECK (legal_basis IN ('consent', 'contract', 'legitimate_interest', 'legal_obligation')),
  source       text NOT NULL CHECK (source IN ('form', 'phone', 'email', 'in_person', 'letter', 'portal', 'import', 'lead')),
  evidence     text CHECK (evidence IS NULL OR length(evidence) <= 1000),
  effective_at timestamptz NOT NULL DEFAULT now(),
  recorded_by  uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_action_fits CHECK (
    (purpose = 'all' AND action IN ('opt_out', 'opt_in') AND legal_basis IS NULL)
    OR (purpose <> 'all' AND action = 'granted' AND legal_basis IS NOT NULL)
    OR (purpose <> 'all' AND action = 'withdrawn' AND legal_basis IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_customer_consents ON public.customer_consents (customer_id, purpose, effective_at DESC, id DESC);

DROP TRIGGER IF EXISTS customer_consents_append_only ON public.customer_consents;
CREATE TRIGGER customer_consents_append_only BEFORE UPDATE OR DELETE ON public.customer_consents
  FOR EACH ROW EXECUTE FUNCTION app_private.forbid_change();
SELECT app_private.attach_audit('public.customer_consents', 'id', '{}', '{evidence}');

ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_consents_select ON public.customer_consents;
CREATE POLICY customer_consents_select ON public.customer_consents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id));
REVOKE ALL ON public.customer_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_consents TO authenticated;
GRANT SELECT, INSERT ON public.customer_consents TO service_role;

-- Current state per purpose (latest event wins). security_invoker: RLS of the caller applies.
CREATE OR REPLACE VIEW public.v_customer_consent_state WITH (security_invoker = true) AS
SELECT DISTINCT ON (customer_id, purpose)
       customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by, id AS event_id
  FROM public.customer_consents
 WHERE effective_at <= now()
 ORDER BY customer_id, purpose, effective_at DESC, id DESC;
REVOKE ALL ON public.v_customer_consent_state FROM PUBLIC, anon;
GRANT SELECT ON public.v_customer_consent_state TO authenticated;

-- ------------------------------------------------------------
-- The send-time check
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.may_contact(p_customer_id uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c      public.customers%ROWTYPE;
  v_opt  text;
  v_last public.customer_consents%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND OR c.erased_at IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'customer_not_found');
  END IF;
  IF c.archived_at IS NOT NULL OR c.status = 'former' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'customer_inactive');
  END IF;
  SELECT action INTO v_opt FROM public.customer_consents
   WHERE customer_id = p_customer_id AND purpose = 'all' AND effective_at <= now()
   ORDER BY effective_at DESC, id DESC LIMIT 1;
  IF v_opt = 'opt_out' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'opt_out');
  END IF;
  IF p_purpose IN ('contact_email', 'marketing_email', 'birthday_email', 'holiday_email') AND c.email IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_address');
  END IF;
  IF p_purpose IN ('contact_phone', 'contact_whatsapp') AND c.phone IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_address');
  END IF;
  IF p_purpose = 'birthday_email' AND c.date_of_birth IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_birth_date');
  END IF;
  SELECT * INTO v_last FROM public.customer_consents
   WHERE customer_id = p_customer_id AND purpose = p_purpose AND effective_at <= now()
   ORDER BY effective_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_legal_basis');
  END IF;
  IF v_last.action = 'withdrawn' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'withdrawn', 'since', v_last.effective_at);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'legal_basis', v_last.legal_basis, 'since', v_last.effective_at, 'event_id', v_last.id);
END
$$;

-- For the UI: the same check, only for customers the caller may see.
CREATE OR REPLACE FUNCTION public.rpc_may_contact(p_customer_id uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND app_private.can_see_customer(c.owner_id)) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN app_private.may_contact(p_customer_id, p_purpose);
END
$$;

-- ------------------------------------------------------------
-- Recording
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_record_consent(
  p_customer_id uuid, p_purpose text, p_action text, p_legal_basis text, p_source text,
  p_evidence text DEFAULT NULL, p_effective_at timestamptz DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c    public.customers%ROWTYPE;
  v_at timestamptz := coalesce(p_effective_at, now());
  v_id bigint;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.erased_at IS NOT NULL THEN RAISE EXCEPTION 'customer_erased' USING ERRCODE = 'P0001'; END IF;
  PERFORM app_private.assert_can_write_customer(c.owner_id);
  IF v_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'date_in_future' USING ERRCODE = 'P0001'; END IF;
  IF v_at < '2000-01-01' THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023'; END IF;
  -- A granted consent (basis 'consent') needs evidence: where and how it was given.
  IF p_action = 'granted' AND p_legal_basis = 'consent' AND length(btrim(coalesce(p_evidence, ''))) < 5 THEN
    RAISE EXCEPTION 'consent_evidence_required' USING ERRCODE = '22023';
  END IF;
  PERFORM app_private.set_audit_context(CASE p_action
    WHEN 'granted' THEN 'Einwilligung/Rechtsgrundlage erfasst' WHEN 'withdrawn' THEN 'Widerruf erfasst'
    WHEN 'opt_out' THEN 'Widerspruch gegen Kontaktaufnahme' ELSE 'Widerspruch aufgehoben' END);
  INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by)
  VALUES (p_customer_id, p_purpose, p_action, p_legal_basis, p_source, nullif(btrim(coalesce(p_evidence, '')), ''), v_at,
          app_private.current_employee_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Lead conversion: the lead's recorded basis becomes the contact basis.
CREATE OR REPLACE FUNCTION app_private.copy_lead_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.consent_basis IS NOT NULL THEN
    INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by)
    SELECT NEW.customer_id, p, 'granted', NEW.consent_basis, 'lead',
           'Aus Lead L-' || lpad(NEW.lead_no::text, 5, '0') || ' übernommen', coalesce(NEW.consent_recorded_at, now()),
           app_private.current_employee_id()
      FROM unnest(ARRAY['contact_phone', 'contact_email']) p;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS leads_copy_consent ON public.leads;
CREATE TRIGGER leads_copy_consent AFTER UPDATE OF customer_id ON public.leads
  FOR EACH ROW WHEN (OLD.customer_id IS NULL AND NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION app_private.copy_lead_consent();

-- Compliance/admin overview: current state counts per purpose.
CREATE OR REPLACE FUNCTION public.rpc_consent_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (app_private.has_role('compliance') OR app_private.has_role('admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'customers', (SELECT count(*) FROM public.customers WHERE erased_at IS NULL AND archived_at IS NULL),
    'opt_outs', (SELECT count(*) FROM (
        SELECT DISTINCT ON (customer_id) action FROM public.customer_consents WHERE purpose = 'all' AND effective_at <= now()
         ORDER BY customer_id, effective_at DESC, id DESC) x WHERE x.action = 'opt_out'),
    'by_purpose', coalesce((SELECT jsonb_agg(x ORDER BY x.purpose) FROM (
        SELECT s.purpose,
               count(*) FILTER (WHERE s.action = 'granted') AS granted,
               count(*) FILTER (WHERE s.action = 'withdrawn') AS withdrawn,
               count(*) FILTER (WHERE s.action = 'granted' AND s.legal_basis = 'consent') AS by_consent
          FROM (SELECT DISTINCT ON (customer_id, purpose) customer_id, purpose, action, legal_basis
                  FROM public.customer_consents WHERE purpose <> 'all' AND effective_at <= now()
                 ORDER BY customer_id, purpose, effective_at DESC, id DESC) s
         GROUP BY s.purpose) x), '[]'::jsonb),
    'recent_withdrawals', (SELECT count(*) FROM public.customer_consents
                            WHERE action IN ('withdrawn', 'opt_out') AND recorded_at > now() - interval '30 days'));
END
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_may_contact(uuid, text),
  public.rpc_record_consent(uuid, text, text, text, text, text, timestamptz), public.rpc_consent_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_may_contact(uuid, text),
  public.rpc_record_consent(uuid, text, text, text, text, text, timestamptz), public.rpc_consent_report() TO authenticated;
