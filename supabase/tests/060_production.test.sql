-- ============================================================
-- r1/p1/production
-- ============================================================
BEGIN;
SELECT plan(56);

-- Helper: one golden case → "points|ae|kv_points" or "error:<key>"
CREATE FUNCTION pg_temp.golden(p_cat text, p_premium numeric, p_period text, p_ng text, p_term numeric,
                               p_day date DEFAULT '2026-06-01', p_cur text DEFAULT 'EUR')
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN (r ->> 'ok')::boolean
              THEN concat_ws('|', r ->> 'points', r ->> 'ae', r ->> 'kv_points')
              ELSE 'error:' || (r ->> 'error') END
    FROM (SELECT app_private.calculate_points(p_cat, p_premium, p_period, p_ng, p_cur, p_term, p_day) AS r) x
$$;

-- ---------- golden cases (shared IDs with src/domain/points.test.ts) ----------
SELECT is(pg_temp.golden('LV', 100, 'monthly', NULL, 35), '10.5000|294.0000|0.0000', 'GC-POINTS-001 LV 100 €/month, 35 years → 10.5 P (§14.1)');
SELECT is(pg_temp.golden('KV', 700, 'monthly', NULL, NULL), '25.0000|700.0000|25.0000', 'GC-POINTS-002 KV 700 €/month → 25 P, tagged KV (§14.1)');
SELECT is(pg_temp.golden('SACH', 1000, 'annual', 'net', NULL), '5.0000|140.0000|0.0000', 'GC-POINTS-003 Sach 1000 € annual net → 5 P (§14.1)');
SELECT is(pg_temp.golden('KFZ', 500, 'annual', NULL, NULL), '0.0000|0.0000|0.0000', 'GC-POINTS-004 Kfz → 0 P / 0 AE (§3.4)');
SELECT is(pg_temp.golden('STROM', 80, 'monthly', NULL, NULL), '0.0000|0.0000|0.0000', 'GC-POINTS-005 Strom → 0 P');
SELECT is(pg_temp.golden('GAS', 80, 'monthly', NULL, NULL), '0.0000|0.0000|0.0000', 'GC-POINTS-006 Gas → 0 P');
SELECT is(pg_temp.golden('LV', 100, 'monthly', NULL, 40), '10.5000|294.0000|0.0000', 'GC-POINTS-007 LV term 40 capped at 35 (OD-06)');
SELECT is(pg_temp.golden('LV', 85.37, 'monthly', NULL, 23), '5.8905|164.9340|0.0000', 'GC-POINTS-008 LV 85.37 × 12 × 23 ÷ 4000 = 5.89053 → 5.8905');
SELECT is(pg_temp.golden('KV', 333.33, 'monthly', NULL, NULL), '11.9046|333.3288|11.9046', 'GC-POINTS-009 KV 333.33 ÷ 28 → 11.9046, AE from rounded points');
SELECT is(pg_temp.golden('SACH', 1000, 'annual', 'gross', NULL), 'error:net_premium_required', 'GC-POINTS-010 Sach gross premium refused (§3.3)');
SELECT is(pg_temp.golden('KV', 8400, 'annual', NULL, NULL), 'error:premium_period_mismatch', 'GC-POINTS-011 KV entered annually refused');
SELECT is(pg_temp.golden('LV', 100, 'monthly', NULL, NULL), 'error:term_required', 'GC-POINTS-012 LV without term refused');
SELECT is(pg_temp.golden('KV', 700, 'monthly', NULL, NULL, '2026-06-01', 'USD'), 'error:currency_not_supported', 'GC-POINTS-013 non-EUR refused');
SELECT is(pg_temp.golden('KV', 700, 'monthly', NULL, NULL, '2025-12-31'), 'error:no_rules_for_date', 'GC-POINTS-014 no rules before 2026');
SELECT is(pg_temp.golden('SACH', 0.01, 'annual', 'net', NULL), '0.0001|0.0028|0.0000', 'GC-POINTS-015 0.00005 rounds half up to 0.0001');
SELECT is(pg_temp.golden('LV', 100, 'monthly', NULL, 10.5), '3.1500|88.2000|0.0000', 'GC-POINTS-016 fractional LV term');
SELECT is(pg_temp.golden('KV', 0, 'monthly', NULL, NULL), 'error:premium_must_be_positive', 'GC-POINTS-017 zero premium refused');

SELECT is(app_private.calculate_points('LV', 100, 'monthly', NULL, 'EUR', 40, '2026-06-01') -> 'details' ->> 'term_capped', 'true',
  'capped term is flagged in the details');
SELECT ok(app_private.calculate_points('LV', 100, 'monthly', NULL, 'EUR', 35, '2026-06-01') -> 'details' ? 'formula',
  'details carry the formula (§14.1)');

-- ---------- fixtures ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('finance@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_fb', NULL, '2026-01-01', 'Spitze der Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_fb', '2026-01-01', 'FA arbeitet unter FB');

-- ---------- entry ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_production(NULL, :'e_fa', 'LV', 100, 'monthly', NULL, 35, '2026-05-10', 'LV-4711') AS p1 \gset
SELECT is((SELECT status FROM public.production_records WHERE id = :'p1'), 'draft', 'producer creates a draft');
SELECT throws_ok(format($$SELECT public.rpc_save_production(NULL, %L, 'KV', 700, 'monthly', NULL, NULL, '2026-05-10')$$, :'e_peer'),
  '42501', 'forbidden', 'cannot enter production for someone else');
SELECT throws_ok(format($$SELECT public.rpc_save_production(NULL, %L, 'SACH', 1000, 'annual', 'gross', NULL, '2026-05-10')$$, :'e_fa'),
  '22023', 'net_premium_required', 'invalid facts are refused with the engine key');
SELECT throws_ok(format($$SELECT public.rpc_save_production(NULL, %L, 'KV', 700, 'monthly', NULL, NULL, '2025-12-15')$$, :'e_fa'),
  '22023', 'before_producer_start', 'production before the producer''s start date is refused');
SELECT throws_ok(format($$SELECT public.rpc_save_production(NULL, %L, 'KV', 700, 'monthly', NULL, NULL, %L)$$, :'e_fa',
                        app_private.business_today() + 1),
  '22023', 'production_date_in_future', 'future production date refused');
SELECT throws_ok(format($$SELECT public.rpc_save_production(NULL, %L, 'KV', -5, 'monthly', NULL, NULL, '2026-05-10')$$, :'e_fa'),
  '22023', 'premium_must_be_positive', 'negative premium refused');
SELECT lives_ok(format($$SELECT public.rpc_save_production(%L, %L, 'LV', 120, 'monthly', NULL, 35, '2026-05-10', 'LV-4711')$$, :'p1', :'e_fa'),
  'draft can be edited');

SELECT throws_ok($$INSERT INTO public.production_records (producer_id, category_code, premium_amount, premium_period, production_date)
                   SELECT id, 'KV', 1, 'monthly', '2026-05-01' FROM public.employees LIMIT 1$$, '42501', NULL, 'no direct inserts');

-- ---------- lifecycle ----------
SELECT public.rpc_submit_production(:'p1');
SELECT throws_ok(format($$SELECT public.rpc_save_production(%L, %L, 'LV', 130, 'monthly', NULL, 35, '2026-05-10')$$, :'p1', :'e_fa'),
  'P0001', 'not_editable', 'submitted records are not editable');
SELECT throws_ok(format($$SELECT public.rpc_mark_production_eligible(%L)$$, :'p1'), '42501', 'forbidden', 'producer cannot mark eligible');

SELECT tests.authenticate_as(:'fin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_mark_production_eligible(%L)$$, :'p1'), '42501', 'mfa_required', 'finance needs MFA');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT public.rpc_mark_production_eligible(:'p1');
SELECT is((SELECT points FROM public.v_production WHERE id = :'p1'), 12.6000::numeric, 'eligible record has points (120 × 12 × 35 ÷ 4000)');
SELECT is((SELECT ae FROM public.v_production WHERE id = :'p1'), 352.8000::numeric, 'AE = points × 28');
SELECT is((SELECT count(*) FROM public.point_calculations WHERE production_id = :'p1')::int, 1, 'one original calculation');
SELECT ok((SELECT rule_version_id IS NOT NULL FROM public.point_calculations WHERE production_id = :'p1'), 'calculation records the rule version');
SELECT throws_ok(format($$SELECT public.rpc_mark_production_eligible(%L)$$, :'p1'), 'P0001', 'invalid_status', 'cannot mark eligible twice');

-- correction: reversal + new original, totals reflect new facts
SELECT throws_ok(format($$SELECT public.rpc_correct_production(%L, 100, 'monthly', NULL, 35, '2026-05-10', 'kurz')$$, :'p1'),
  '22023', 'reason_required', 'correction needs a reason');
SELECT public.rpc_correct_production(:'p1', 100, 'monthly', NULL, 35, '2026-05-10', 'Beitrag laut Police korrigiert');
SELECT is((SELECT points FROM public.v_production WHERE id = :'p1'), 10.5000::numeric, 'corrected record shows the new points');
SELECT is((SELECT array_agg(points ORDER BY seq) FROM public.point_calculations WHERE production_id = :'p1'),
  ARRAY[12.6000, -12.6000, 10.5000]::numeric[], 'ledger keeps original, reversal and new original');

-- cancellation of an eligible record reverses the points
SELECT public.rpc_cancel_production(:'p1', 'Vertrag vom Kunden widerrufen');
SELECT is((SELECT points FROM public.v_production WHERE id = :'p1'), 0.0000::numeric, 'cancelled record nets to 0 points');
SELECT is((SELECT status FROM public.production_records WHERE id = :'p1'), 'cancelled', 'status cancelled');
SELECT throws_ok(format($$SELECT public.rpc_cancel_production(%L, 'Nochmal stornieren')$$, :'p1'), 'P0001', 'invalid_status', 'cannot cancel twice');

SELECT tests.clear_authentication();
SELECT throws_ok($$UPDATE public.point_calculations SET points = 99$$, '42501', 'append_only', 'calculations are append-only even for postgres');
SELECT throws_ok($$DELETE FROM public.point_calculations$$, '42501', 'append_only', 'calculations cannot be deleted');

-- KV record is tagged
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_production(NULL, :'e_fa', 'KV', 700, 'monthly', NULL, NULL, '2026-05-11') AS p2 \gset
SELECT public.rpc_submit_production(:'p2');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_mark_production_eligible(:'p2');
SELECT is((SELECT kv_points FROM public.v_production WHERE id = :'p2'), 25.0000::numeric, 'KV record carries KV points');

-- ---------- visibility ----------
SELECT tests.authenticate_as(:'fb');
SELECT is((SELECT count(*) FROM public.v_production)::int, 2, 'leader sees their team''s production');
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.v_production)::int, 0, 'peer sees nothing');
SELECT is((SELECT count(*) FROM public.point_calculations)::int, 0, 'peer sees no calculations');
SELECT tests.authenticate_as(:'fa');
SELECT ok((SELECT count(*) FROM public.rpc_audit_for('public.production_records', :'p1')) >= 1, 'producer can read their record''s history');
SELECT tests.authenticate_as(:'peer');
SELECT throws_ok(format($$SELECT * FROM public.rpc_audit_for('public.production_records', %L)$$, :'p1'), '42501', 'forbidden', 'peer cannot');

-- ---------- import ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_stage_production_import('Partnerportal', 'oktober.csv', format($$[
  {"source_id": "A-1", "employee_no": %s, "category": "kv", "premium": "700", "period": "monthly", "production_date": "2026-06-01"},
  {"source_id": "A-2", "employee_no": %s, "category": "LV", "premium": "100", "period": "monthly", "term_years": "35", "production_date": "2026-06-02"},
  {"source_id": "A-2", "employee_no": %s, "category": "LV", "premium": "100", "period": "monthly", "term_years": "35", "production_date": "2026-06-02"},
  {"source_id": "A-3", "employee_no": "X999", "category": "KV", "premium": "700", "period": "monthly", "production_date": "2026-06-01"},
  {"source_id": "A-4", "employee_no": %s, "category": "SACH", "premium": "1000", "period": "annual", "net_or_gross": "gross", "production_date": "2026-06-01"},
  {"source_id": "A-5", "employee_no": %s, "category": "KV", "premium": "abc", "period": "monthly", "production_date": "2026-06-01"},
  {"source_id": "", "employee_no": %s, "category": "KV", "premium": "700", "period": "monthly", "production_date": "2026-06-01"}
]$$,
  to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')),
  to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')),
  to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')),
  to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')),
  to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')),
  to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')))::jsonb) AS batch \gset

SELECT is((SELECT jsonb_build_array(row_count, valid_count) FROM public.import_batches WHERE id = :'batch'), '[7, 2]'::jsonb, '7 rows staged, 2 valid');
SELECT is((SELECT jsonb_object_agg(row_number, errors) FROM public.import_rows WHERE batch_id = :'batch' AND cardinality(errors) > 0),
  '{"3": ["duplicate_in_file"], "4": ["unknown_employee_no"], "5": ["net_premium_required"], "6": ["invalid_value"], "7": ["source_id_required"]}'::jsonb,
  'each invalid row names its problem');
SELECT is(public.rpc_commit_production_import(:'batch'), 2, 'only valid rows are committed');
SELECT is((SELECT count(*) FROM public.production_records WHERE import_batch_id = :'batch' AND status = 'submitted')::int, 2, 'imported as submitted');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM audit.events WHERE entity_type = 'public.production_records' AND action = 'insert' AND correlation_id = :'batch'::uuid)::int,
  2, 'imported rows share the batch correlation id');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_commit_production_import(%L)$$, :'batch'), 'P0001', 'invalid_status', 'a batch commits once');

SELECT public.rpc_stage_production_import('Partnerportal', 'nochmal.csv', format($$[
  {"source_id": "A-1", "employee_no": %s, "category": "KV", "premium": "700", "period": "monthly", "production_date": "2026-06-01"}
]$$, to_jsonb((SELECT employee_no FROM public.employees WHERE id = :'e_fa')))::jsonb) AS batch2 \gset
SELECT is((SELECT errors FROM public.import_rows WHERE batch_id = :'batch2'), ARRAY['already_imported'], 're-importing the same source id is caught');

SELECT * FROM finish();
ROLLBACK;
