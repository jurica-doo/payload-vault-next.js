-- ============================================================
-- r1/p5/contract-links
-- ============================================================
BEGIN;
SELECT plan(22);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset

SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer('{"last_name": "Vertrag", "email": "v@example.org"}') AS c1 \gset
SELECT public.rpc_create_customer('{"last_name": "Zweitkunde", "email": "z@example.org"}') AS c2 \gset

-- ---------- manual links ----------
SELECT public.rpc_save_contract_link(NULL, :'c1', '{"external_contract_id": "LV-123", "category_code": "LV", "insurer": "Muster AG", "status": "active"}') AS k1 \gset
SELECT is((SELECT source_system FROM public.contract_links WHERE id = :'k1'), 'manual', 'manual source by default');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "LV-123"}')$$, :'c1'),
  'P0001', 'contract_exists', 'the same contract number is not linked twice');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "KV-9", "renewal_date": "2027-01-01"}')$$, :'c1'),
  'P0001', 'dates_unconfirmed', 'policy dates only when confirmed (§10.3)');
SELECT public.rpc_save_contract_link(NULL, :'c1', '{"external_contract_id": "KV-9", "renewal_date": "2027-01-01"}', true) AS k2 \gset
SELECT ok((SELECT date_source = 'manual_confirmed' AND dates_confirmed_by IS NOT NULL FROM public.contract_links WHERE id = :'k2'),
  'confirmed dates record who confirmed them');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "X1", "deep_link": "http://portal.example/x"}')$$, :'c1'),
  '22023', 'invalid_deep_link', 'deep links must be https');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "X2", "source_system": "scraper"}')$$, :'c1'),
  '22023', 'unknown_source_system', 'only configured source systems');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "X3", "premium": 10}')$$, :'c1'),
  '22023', 'invalid_input', 'unknown fields rejected');
SELECT lives_ok(format($$SELECT public.rpc_save_contract_link(%L, NULL, '{"status": "cancelled"}')$$, :'k1'), 'manual links can be edited');
SELECT public.rpc_link_customer_external(:'c1', 'portal', 'P-1001');
SELECT throws_ok(format($$SELECT public.rpc_link_customer_external(%L, 'portal', 'P-1001')$$, :'c2'), 'P0001', 'external_id_taken',
  'an external customer id belongs to one customer');

-- ---------- permissions ----------
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.contract_links)::int, 0, 'contracts follow customer visibility');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(NULL, %L, '{"external_contract_id": "P1"}')$$, :'c1'), '42501', 'forbidden',
  'peers cannot link contracts');
SELECT throws_ok($$SELECT public.rpc_ingest_contracts('portal', '[]')$$, '42501', NULL, 'users cannot run the sync intake');

-- ---------- sync intake ----------
SELECT tests.authenticate_as_service_role();
SELECT public.rpc_ingest_contracts('portal', jsonb_build_array(
  jsonb_build_object('external_customer_id', 'P-1001', 'external_contract_id', 'V-1', 'category_code', 'KV', 'status', 'active',
                     'start_date', '2024-01-01', 'renewal_date', '2027-01-01', 'deep_link', 'https://portal.example/v/1'),
  jsonb_build_object('external_customer_id', 'P-9999', 'external_contract_id', 'V-2', 'insurer', 'Geheim AG'),
  jsonb_build_object('external_customer_id', 'P-1001', 'external_contract_id', 'V-3', 'start_date', '2024-13-45'),
  jsonb_build_object('external_customer_id', 'P-1001', 'external_contract_id', 'V-4', 'category_code', 'XYZ')
)) AS r \gset
SELECT is((:'r'::jsonb ->> 'ok')::int, 1, 'one valid row');
SELECT is((:'r'::jsonb ->> 'failed')::int, 3, 'three rejected rows');
SELECT is((SELECT status FROM public.sync_runs WHERE id = (:'r'::jsonb ->> 'run_id')::uuid), 'partial', 'run status partial');
SELECT is((SELECT array_agg(error_code ORDER BY row_no) FROM public.sync_errors), ARRAY['customer_not_found', 'invalid_date', 'unknown_category'],
  'error codes per row');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.sync_errors e WHERE to_jsonb(e)::text LIKE '%Geheim%'), 'errors keep metadata only, no payload');
SELECT ok((SELECT date_source = 'portal' AND last_synced_at IS NOT NULL FROM public.contract_links WHERE external_contract_id = 'V-1'),
  'synced dates are marked as portal data');
SELECT public.rpc_ingest_contracts('portal', jsonb_build_array(
  jsonb_build_object('external_customer_id', 'P-1001', 'external_contract_id', 'V-1', 'category_code', 'KV', 'status', 'cancelled')));
SELECT is((SELECT count(*) FROM public.contract_links WHERE external_contract_id = 'V-1')::int, 1, 're-sync updates, never duplicates');
SELECT ok((SELECT status = 'cancelled' AND start_date IS NULL AND date_source IS NULL FROM public.contract_links WHERE external_contract_id = 'V-1'),
  'the source system is authoritative for synced contracts');

SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_save_contract_link(%L, NULL, '{"status": "active"}')$$,
  (SELECT id FROM public.contract_links WHERE external_contract_id = 'V-1')), 'P0001', 'synced_read_only', 'synced contracts are read-only');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is((SELECT count(*) FROM public.sync_runs)::int, 2, 'admins see sync runs');

SELECT * FROM finish();
ROLLBACK;
