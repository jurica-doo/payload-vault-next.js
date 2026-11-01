-- ============================================================
-- Production import: validate what the table enforces; one source per name
-- ============================================================
-- 1. Staging validated the points engine only. Values the engine ignores but
--    the table refuses (a Kfz row with Rhythmus "quartalsweise", Netto/Brutto
--    "x", Laufzeit 0, a Referenz over 120 characters) were shown as "OK", and
--    committing the batch then failed as a whole with a generic message.
--    validate_production (shared by manual entry and import) now checks
--    them first and returns a key per problem.
-- 2. Dates were cast with the server's date style, so "06/05/2026" became
--    5 June. Staging accepts ISO dates only (the app converts TT.MM.JJJJ).
-- 3. Duplicate protection compared the free-text Quellsystem exactly, so
--    "E2E" and "e2e" imported the same Quelle-ID twice (points and commission
--    would count twice). It now ignores case and surrounding spaces, and a
--    unique index enforces the same in the database.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_source_unique_ci
  ON public.production_records (lower(source_system), source_system_id) WHERE source_system IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.validate_production(p production_records)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
BEGIN
  SELECT * INTO v_emp FROM public.employees WHERE id = p.producer_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown_producer'); END IF;
  IF p.production_date < v_emp.start_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'before_producer_start');
  END IF;
  IF v_emp.deactivated_at IS NOT NULL AND p.production_date > (v_emp.deactivated_at AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'after_producer_deactivation');
  END IF;
  IF p.production_date > app_private.business_today() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'production_date_in_future');
  END IF;
  -- The table's own constraints, so a row reported as valid can be stored.
  IF p.premium_period IS NULL OR p.premium_period NOT IN ('monthly', 'annual', 'one_off') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_premium_period');
  END IF;
  IF p.net_or_gross IS NOT NULL AND p.net_or_gross NOT IN ('net', 'gross') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_net_or_gross');
  END IF;
  IF p.term_years IS NOT NULL AND p.term_years <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_term');
  END IF;
  IF length(p.product_reference) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reference_too_long');
  END IF;
  IF length(p.notes) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'notes_too_long');
  END IF;
  RETURN app_private.calculate_points(p.category_code, p.premium_amount, p.premium_period,
                                      p.net_or_gross, p.currency, p.term_years, p.production_date);
END
$$;

CREATE OR REPLACE FUNCTION app_rpc.rpc_stage_production_import(p_source_system text, p_file_name text, p_rows jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  v_batch  uuid;
  v_item   jsonb;
  v_n      integer := 0;
  v_valid  integer := 0;
  v_errors text[];
  v_emp    uuid;
  v_row    public.production_records%ROWTYPE;
  v_check  jsonb;
  v_seen   text[] := '{}';
  v_src    text;
BEGIN
  PERFORM app_private.assert_admin();
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_rows) > 5000 THEN RAISE EXCEPTION 'too_many_rows' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.import_batches (kind, source_system, file_name, created_by)
  VALUES ('production', btrim(p_source_system), p_file_name, auth.uid())
  RETURNING id INTO v_batch;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_n := v_n + 1;
    v_errors := '{}';
    v_src := nullif(btrim(v_item ->> 'source_id'), '');

    IF v_src IS NULL THEN
      v_errors := array_append(v_errors, 'source_id_required');
    ELSIF v_src = ANY (v_seen) THEN
      v_errors := array_append(v_errors, 'duplicate_in_file');
    ELSIF EXISTS (SELECT 1 FROM public.production_records pr
                   WHERE lower(pr.source_system) = lower(btrim(p_source_system)) AND pr.source_system_id = v_src) THEN
      v_errors := array_append(v_errors, 'already_imported');
    END IF;
    v_seen := v_seen || v_src;

    SELECT e.id INTO v_emp FROM public.employees e WHERE e.employee_no = upper(btrim(v_item ->> 'employee_no'));
    IF v_emp IS NULL THEN v_errors := array_append(v_errors, 'unknown_employee_no'); END IF;

    BEGIN
      v_row.producer_id := v_emp;
      v_row.category_code := upper(btrim(v_item ->> 'category'));
      v_row.premium_amount := (v_item ->> 'premium')::numeric(12, 2);
      v_row.premium_period := lower(btrim(v_item ->> 'period'));
      v_row.net_or_gross := nullif(lower(btrim(coalesce(v_item ->> 'net_or_gross', ''))), '');
      v_row.term_years := nullif(btrim(coalesce(v_item ->> 'term_years', '')), '')::numeric;
      -- Only ISO dates (the app converts TT.MM.JJJJ); anything else would be
      -- read with the server's date style, e.g. 06/05/2026 as 5 June.
      IF coalesce(v_item ->> 'production_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION USING ERRCODE = 'invalid_datetime_format';
      END IF;
      v_row.production_date := (v_item ->> 'production_date')::date;
      v_row.product_reference := nullif(btrim(coalesce(v_item ->> 'reference', '')), '');
      v_row.currency := upper(coalesce(nullif(btrim(v_item ->> 'currency'), ''), 'EUR'));
      IF v_emp IS NOT NULL THEN
        v_check := app_private.validate_production(v_row);
        IF NOT (v_check ->> 'ok')::boolean THEN v_errors := array_append(v_errors, v_check ->> 'error'); END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format
                   OR numeric_value_out_of_range THEN
      v_errors := array_append(v_errors, 'invalid_value');
    END;

    INSERT INTO public.import_rows (batch_id, row_number, raw, errors) VALUES (v_batch, v_n, v_item, v_errors);
    IF cardinality(v_errors) = 0 THEN v_valid := v_valid + 1; END IF;
  END LOOP;

  UPDATE public.import_batches SET row_count = v_n, valid_count = v_valid WHERE id = v_batch;
  RETURN v_batch;
END
$$;

CREATE OR REPLACE FUNCTION app_rpc.rpc_commit_production_import(p_batch_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
  b       public.import_batches%ROWTYPE;
  r       public.import_rows%ROWTYPE;
  v_id    uuid;
  v_count integer := 0;
BEGIN
  PERFORM app_private.assert_admin();
  SELECT * INTO b FROM public.import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF b.status <> 'staged' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  -- One correlation id for the whole batch in the audit trail.
  PERFORM app_private.set_audit_context(format('Import %s (%s)', b.source_system, coalesce(b.file_name, '–')), b.id);

  FOR r IN SELECT * FROM public.import_rows WHERE batch_id = p_batch_id AND cardinality(errors) = 0 ORDER BY row_number LOOP
    INSERT INTO public.production_records
      (producer_id, category_code, premium_amount, premium_period, net_or_gross, currency, term_years,
       production_date, product_reference, status, source, source_system, source_system_id, import_batch_id, created_by)
    SELECT e.id, upper(btrim(r.raw ->> 'category')), (r.raw ->> 'premium')::numeric(12, 2),
           lower(btrim(r.raw ->> 'period')), nullif(lower(btrim(coalesce(r.raw ->> 'net_or_gross', ''))), ''),
           upper(coalesce(nullif(btrim(r.raw ->> 'currency'), ''), 'EUR')),
           nullif(btrim(coalesce(r.raw ->> 'term_years', '')), '')::numeric,
           (r.raw ->> 'production_date')::date, nullif(btrim(coalesce(r.raw ->> 'reference', '')), ''),
           'submitted', 'import', b.source_system, btrim(r.raw ->> 'source_id'), b.id, auth.uid()
      FROM public.employees e WHERE e.employee_no = upper(btrim(r.raw ->> 'employee_no'))
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      UPDATE public.import_rows SET production_id = v_id WHERE id = r.id;
      v_count := v_count + 1;
    END IF;
    v_id := NULL;
  END LOOP;

  UPDATE public.import_batches
     SET status = 'committed', committed_count = v_count, committed_at = now()
   WHERE id = p_batch_id;
  RETURN v_count;
END
$$;
