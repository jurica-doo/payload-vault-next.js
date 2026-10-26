-- ============================================================
-- r1/p1/hierarchy
-- ============================================================
BEGIN;
SELECT plan(37);

-- ---------- fixtures: spec §5.3 chain DL → TL → FB → FA, plus a second TL ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('tl2@test.local', true) AS tl2 \gset
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset

SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'tl2') AS e_tl2,
       tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer \gset

-- ---------- permissions ----------
SELECT tests.authenticate_as(:'dl', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_tl', :'e_dl', '2026-01-01', 'Aufbau Struktur Nord'),
  '42501', 'forbidden', 'non-admin cannot change the hierarchy');
SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_tl', :'e_dl', '2026-01-01', 'Aufbau Struktur Nord'),
  '42501', 'mfa_required', 'admin needs MFA');

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_tl', :'e_dl', '2026-01-01', 'kurz'),
  '22023', 'reason_required', 'reason required');

-- build the structure
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'DL ist Spitze der Struktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Struktur Nord');
SELECT public.rpc_assign_manager(:'e_tl2', :'e_dl', '2026-01-01', 'Aufbau Struktur Nord');
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl', '2026-01-01', 'Aufbau Struktur Nord');
SELECT public.rpc_assign_manager(:'e_fa', :'e_fb', '2026-01-01', 'Aufbau Struktur Nord');

SELECT is((SELECT count(*) FROM public.hierarchy_assignments)::int, 5, 'five assignments created');
SELECT tests.clear_authentication();
SELECT is((SELECT reason FROM audit.events WHERE entity_type = 'public.hierarchy_assignments' ORDER BY id DESC LIMIT 1),
  'Aufbau Struktur Nord', 'assignment audited with its reason');
SELECT tests.authenticate_as(:'admin', 'aal2');

-- ---------- traversal ----------
SELECT is((SELECT array_agg(ancestor_id ORDER BY depth) FROM app_private.ancestors_at(:'e_fa', '2026-06-01')),
  ARRAY[:'e_fb', :'e_tl', :'e_dl']::uuid[], 'FA''s chain is FB, TL, DL in order');
SELECT is((SELECT count(*) FROM app_private.descendants_at(:'e_dl', '2026-06-01'))::int, 4, 'DL has 4 descendants');
SELECT is((SELECT count(*) FROM app_private.ancestors_at(:'e_fa', '2025-12-31'))::int, 0, 'no chain before the assignments start');

-- ---------- visibility ----------
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.employees)::int, 1, 'FA sees only themselves');
SELECT tests.authenticate_as(:'fb');
SELECT is((SELECT count(*) FROM public.employees)::int, 2, 'FB sees themselves and FA');
SELECT is((public.rpc_my_context() ->> 'descendant_count')::int, 1, 'FB has one descendant → leader');
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT count(*) FROM public.employees)::int, 5, 'DL sees the whole structure');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.employees WHERE id = :'e_peer'), 'DL does not see people outside the structure');
SELECT tests.authenticate_as(:'tl');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.employees WHERE id = :'e_dl'), 'TL does not see their own manager');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.employees WHERE id = :'e_tl2'), 'TL does not see a sibling structure');
SELECT is((SELECT count(*) FROM public.v_current_hierarchy)::int, 3, 'view respects the caller''s RLS');
SELECT tests.authenticate_as(:'peer');
SELECT is((public.rpc_my_context() ->> 'descendant_count')::int, 0, 'peer is not a leader');

-- §14.3: a new subordinate under a subordinate joins the higher leader's indirect structure
SELECT tests.create_user('fa2@test.local', true) AS fa2 \gset
SELECT tests.employee_id(:'fa2') AS e_fa2 \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_fa2', :'e_fb', '2026-03-01', 'Neue Beraterin bei FB');
SELECT tests.authenticate_as(:'dl');
SELECT ok(EXISTS (SELECT 1 FROM public.employees WHERE id = :'e_fa2'), 'new FA under FB is visible to DL (indirect)');
SELECT is((SELECT depth FROM app_private.descendants_at(:'e_dl', '2026-06-01') WHERE descendant_id = :'e_fa2'), 3, 'at depth 3 (TL → FB → FA2)');

-- ---------- cycles ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_dl', :'e_fa', '2026-06-01', 'Testweise umhängen'),
  'P0001', 'hierarchy_cycle', 'DL under their own descendant is a cycle');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_fa', :'e_fa', '2026-06-01', 'Sich selbst zuordnen'),
  'P0001', 'hierarchy_cycle', 'self as manager is refused');

-- future-dated: FB moves under TL2 on 2026-09-01; then TL → under FB from 2026-10-01 would be fine
-- (TL is no longer above FB then), but TL → under FA from 2026-08-01 is a cycle on 2026-08-01.
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl2', '2027-09-01', 'Wechsel zu Team Süd');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_tl', :'e_fa', '2027-08-01', 'Geplanter Wechsel'),
  'P0001', 'hierarchy_cycle', 'cycle at a future date is caught');
SELECT lives_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_tl', :'e_fb', '2027-10-01', 'Geplanter Wechsel'),
  'TL under FB is fine once FB has left TL''s structure');

-- ---------- transfer keeps history ----------
SELECT is((SELECT array_agg(ancestor_id ORDER BY depth) FROM app_private.ancestors_at(:'e_fa', '2027-08-31')),
  ARRAY[:'e_fb', :'e_tl', :'e_dl']::uuid[], 'before the transfer FA still rolls up through TL');
SELECT is((SELECT array_agg(ancestor_id ORDER BY depth) FROM app_private.ancestors_at(:'e_fa', '2027-09-01')),
  ARRAY[:'e_fb', :'e_tl2', :'e_dl']::uuid[], 'from the transfer date FA rolls up through TL2');
SELECT is((SELECT effective_to FROM public.hierarchy_assignments WHERE employee_id = :'e_fb' AND manager_id = :'e_tl'),
  '2027-09-01'::date, 'old assignment closed on the transfer date');
SELECT tests.authenticate_as(:'tl2');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.employees WHERE id = :'e_fb'), 'a future transfer does not change today''s visibility');

-- ---------- invalid changes ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_fb', :'e_dl', '2027-06-01', 'Zwischendurch zu DL'),
  'P0001', 'future_assignment_exists', 'cannot insert before a planned transfer');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_fa2', :'e_tl', '2026-02-01', 'Rückdatierung'),
  'P0001', 'before_current_assignment', 'cannot backdate before the current assignment');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_peer', :'e_dl', '2025-01-01', 'Vor Eintritt'),
  'P0001', 'before_start_date', 'cannot assign before the employee''s start date');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_fa2', :'e_fb', '2026-05-01', 'Gleiche Führungskraft'),
  'P0001', 'no_change', 'assigning the same manager is refused');

SELECT public.rpc_set_employee_active(:'e_tl2', false, 'Ausgeschieden zum Quartalsende');
SELECT throws_ok(format('SELECT public.rpc_assign_manager(%L, %L, %L, %L)', :'e_peer', :'e_tl2', '2026-05-01', 'Neue Führungskraft'),
  'P0001', 'manager_inactive', 'cannot assign to an inactive manager');

-- cancelling the planned transfer reopens the previous assignment
SELECT public.rpc_cancel_future_assignment(
  (SELECT id FROM public.hierarchy_assignments WHERE employee_id = :'e_tl' AND effective_from = '2027-10-01'),
  'Wechsel abgesagt');
SELECT ok((SELECT effective_to IS NULL FROM public.hierarchy_assignments WHERE employee_id = :'e_tl' AND manager_id = :'e_dl'),
  'previous assignment reopened after cancelling');

-- ---------- direct writes and DB-level guards ----------
SELECT tests.authenticate_as(:'dl');
SELECT throws_ok(format($$INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from) VALUES (%L, %L, '2026-01-01')$$, :'e_peer', :'e_dl'),
  '42501', NULL, 'no direct inserts');
SELECT tests.clear_authentication();
SELECT throws_ok(format($$INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from) VALUES (%L, %L, '2026-06-01')$$, :'e_fa', :'e_tl'),
  '23P01', NULL, 'overlapping ranges are impossible even for postgres');
SELECT throws_ok(format($$INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, effective_to) VALUES (%L, NULL, '2026-06-01', '2026-06-01')$$, :'e_peer'),
  '23514', NULL, 'zero-length ranges are impossible');

SELECT is(app_private.business_today(), (now() AT TIME ZONE 'Europe/Berlin')::date, 'business date is Berlin time');

SELECT * FROM finish();
ROLLBACK;
