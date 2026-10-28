-- ============================================================
-- r1/p2/ledger
-- ============================================================
BEGIN;
SELECT plan(37);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.grant_role(:'admin', 'finance');
SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('tl2@test.local', true) AS tl2 \gset
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('newbie@test.local', true) AS nb \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'tl2') AS e_tl2,
       tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'nb') AS e_nb \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl2', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_fb', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_nb', :'e_fb', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_dl', 'DL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_tl', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_tl2', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fb', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');

CREATE FUNCTION pg_temp.produce(p_emp uuid, p_cat text, p_premium numeric, p_period text, p_date date)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.rpc_save_production(NULL, p_emp, p_cat, p_premium, p_period, NULL, NULL, p_date);
  PERFORM public.rpc_submit_production(v);
  PERFORM public.rpc_mark_production_eligible(v);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.entries(p_production uuid) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(format('%s:%s:%s/%s/%s', e.last_name, l.commission_type, l.gross_amount, l.reserve_amount, l.net_after_reserve),
                    ', ' ORDER BY l.seq)
    FROM public.commission_ledger l JOIN public.employees e ON e.id = l.recipient_id
   WHERE l.production_id = p_production AND l.entry_kind = 'original'
$$;

-- ---------- §5.3: FA produces 10 points (KV 280 €/month) ----------
SELECT pg_temp.produce(:'e_fa', 'KV', 280, 'monthly', '2026-03-01') AS p1 \gset
SELECT tests.clear_authentication();
SELECT is(pg_temp.entries(:'p1'),
  'Test:personal:280.00/28.00/252.00, Test:differential:280.00/28.00/252.00, Test:differential:140.00/14.00/126.00, Test:differential:420.00/42.00/378.00',
  'FA 280 · FB 280 · TL 140 · DL 420, each with 10 % reserve (§5.3, §6.1)');
SELECT is((SELECT array_agg(recipient_id ORDER BY seq) FROM public.commission_ledger WHERE production_id = :'p1'),
  ARRAY[:'e_fa', :'e_fb', :'e_tl', :'e_dl']::uuid[], 'recipients in chain order');
SELECT is((SELECT array_agg(relationship ORDER BY seq) FROM public.commission_ledger WHERE production_id = :'p1'),
  ARRAY['self', 'direct', 'indirect', 'indirect'], 'relationship recorded');
SELECT is((SELECT array_agg(recipient_level ORDER BY seq) FROM public.commission_ledger WHERE production_id = :'p1'),
  ARRAY['FA', 'FB', 'TL', 'DL'], 'levels on the production date recorded');
SELECT is((SELECT array_agg(rate_per_point ORDER BY seq) FROM public.commission_ledger WHERE production_id = :'p1'),
  ARRAY[28, 28, 14, 42]::numeric[], 'rates applied recorded per entry');
SELECT is((SELECT sum(gross_amount) FROM public.commission_ledger WHERE production_id = :'p1'), 1120.00::numeric,
  'total equals DL rate × points (no double payment, §5.4)');
SELECT is((SELECT sp.period_month FROM public.commission_ledger l JOIN public.statement_periods sp ON sp.id = l.statement_period_id
            WHERE l.production_id = :'p1' LIMIT 1), date_trunc('month', app_private.business_today())::date,
  'booked in the current month');

SELECT is(app_private.book_commission((SELECT id FROM public.point_calculations WHERE production_id = :'p1')), 0,
  'booking the same calculation again writes nothing');

-- ---------- reversal mirrors exactly ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_cancel_production(:'p1', 'Vertrag vom Kunden widerrufen');
SELECT tests.clear_authentication();
SELECT is((SELECT sum(gross_amount) FROM public.commission_ledger WHERE production_id = :'p1'), 0.00::numeric, 'cancelled production nets to 0');
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p1' AND entry_kind = 'reversal')::int, 4, 'one reversal per entry');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.commission_ledger r JOIN public.commission_ledger o ON o.id = r.reverses_entry_id
                       WHERE r.production_id = :'p1' AND (r.recipient_id <> o.recipient_id OR r.gross_amount <> -o.gross_amount)),
  'each reversal mirrors its original');

-- ---------- Kfz books nothing ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT pg_temp.produce(:'e_fa', 'KFZ', 500, 'annual', '2026-03-05') AS p_kfz \gset
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p_kfz')::int, 0, 'zero-point production books no commission');

-- ---------- producer without level → exception, then retry ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT pg_temp.produce(:'e_nb', 'KV', 280, 'monthly', '2026-03-10') AS p_nb \gset
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p_nb')::int, 0, 'nothing booked without a producer level');
SELECT is((SELECT reason_code FROM public.exception_queue WHERE status = 'open'), 'producer_without_level', 'exception raised');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_retry_commission(%L)$$, (SELECT id FROM public.point_calculations WHERE production_id = :'p_nb')),
  'P0001', 'still_not_bookable', 'retry refuses while the level is missing');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_employee_level(:'e_nb', 'FA', '2026-01-01', 'Einstiegsstufe nachgetragen');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT is(public.rpc_retry_commission((SELECT id FROM public.point_calculations WHERE production_id = :'p_nb')), 4, 'retry books 4 entries');
SELECT tests.clear_authentication();
SELECT is((SELECT status FROM public.exception_queue WHERE reason_code = 'producer_without_level'), 'resolved', 'exception resolved');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_retry_commission(%L)$$, (SELECT id FROM public.point_calculations WHERE production_id = :'p_nb')),
  'P0001', 'already_booked', 'cannot book twice');

-- ---------- ancestor without level → nothing booked (no guessing) ----------
SELECT tests.create_user('gap@test.local', true) AS gap \gset
SELECT tests.employee_id(:'gap') AS e_gap \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_gap', :'e_tl2', '2026-01-01', 'Neue FB ohne Stufe');
SELECT public.rpc_set_employee_level(:'e_gap', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
-- give TL2 a report without level in between: gap2 (no level) under TL2, gap under gap2
SELECT tests.create_user('gap2@test.local', true) AS gap2 \gset
SELECT tests.employee_id(:'gap2') AS e_gap2 \gset
SELECT public.rpc_assign_manager(:'e_gap2', :'e_tl2', '2026-01-01', 'Zwischenebene ohne Stufe');
SELECT public.rpc_assign_manager(:'e_gap', :'e_gap2', '2026-02-01', 'Unter die Zwischenebene');
SELECT pg_temp.produce(:'e_gap', 'KV', 280, 'monthly', '2026-03-10') AS p_gap \gset
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p_gap')::int, 0, 'nothing booked when an ancestor has no level');
SELECT is((SELECT details -> 'missing' FROM public.exception_queue WHERE reason_code = 'ancestor_without_level'), jsonb_build_array(:'e_gap2'),
  'exception names the ancestor without a level');

-- ---------- locked month → next open month ----------
UPDATE public.statement_periods SET status = 'approved' WHERE period_month = date_trunc('month', app_private.business_today())::date;
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT pg_temp.produce(:'e_fa', 'KV', 280, 'monthly', '2026-04-01') AS p_late \gset
SELECT tests.clear_authentication();
SELECT is((SELECT DISTINCT sp.period_month FROM public.commission_ledger l JOIN public.statement_periods sp ON sp.id = l.statement_period_id
            WHERE l.production_id = :'p_late'), (date_trunc('month', app_private.business_today()) + interval '1 month')::date,
  'bookings skip an approved month');

-- ---------- transfer: chain on the production date ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl2', '2026-06-01', 'Wechsel ins Team Süd');
SELECT pg_temp.produce(:'e_fa', 'KV', 280, 'monthly', '2026-05-15') AS p_before \gset
SELECT pg_temp.produce(:'e_fa', 'KV', 280, 'monthly', '2026-06-15') AS p_after \gset
SELECT tests.clear_authentication();
SELECT ok(EXISTS (SELECT 1 FROM public.commission_ledger WHERE production_id = :'p_before' AND recipient_id = :'e_tl'),
  'production before the transfer pays the old TL');
SELECT ok(EXISTS (SELECT 1 FROM public.commission_ledger WHERE production_id = :'p_after' AND recipient_id = :'e_tl2')
          AND NOT EXISTS (SELECT 1 FROM public.commission_ledger WHERE production_id = :'p_after' AND recipient_id = :'e_tl'),
  'production after the transfer pays the new TL only');
SELECT id AS l_tl FROM public.commission_ledger WHERE recipient_id = :'e_tl' LIMIT 1 \gset

-- ---------- RLS ----------
SELECT tests.authenticate_as(:'fa');
SELECT ok((SELECT bool_and(recipient_id = :'e_fa') FROM public.commission_ledger), 'FA sees only their own entries');
SELECT ok((SELECT bool_and(recipient_id = :'e_fa') FROM public.v_commission_ledger), 'the view leaks nothing beyond the ledger rule');
SELECT is((SELECT count(*) FROM app_private.commission_ledger_facts(:'l_tl'))::int, 0,
  'the facts helper reveals nothing about other people''s entries');
SELECT tests.authenticate_as(:'tl');
SELECT ok((SELECT bool_and(recipient_id = :'e_tl') FROM public.v_commission_ledger), 'leader sees only own commission by default (OD-17)');
SELECT ok(EXISTS (SELECT 1 FROM public.v_commission_ledger WHERE production_id = :'p_before'),
  'leader still sees own commission after the producer left the structure');
SELECT ok((SELECT bool_and(producer_name IS NOT NULL AND production_date IS NOT NULL AND category_code IS NOT NULL)
             FROM public.v_commission_ledger WHERE production_id = :'p_before'),
  '…including the producer''s name and the production facts');
SELECT ok((SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.v_commission_ledger'::regclass),
  'the view runs with the caller''s rights');
SELECT tests.clear_authentication();
UPDATE public.app_settings SET value = '{"leader_sees_team_commission": true}' WHERE key = 'commission';
SELECT tests.authenticate_as(:'tl2');
SELECT ok(EXISTS (SELECT 1 FROM public.v_commission_ledger WHERE recipient_id = :'e_fa'), 'with the setting on, the leader sees the team''s commission');
SELECT tests.authenticate_as(:'tl');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.v_commission_ledger WHERE recipient_id = :'e_fa'), '…but not of people who left the structure');
SELECT tests.authenticate_as(:'fin');
SELECT ok((SELECT count(DISTINCT recipient_id) FROM public.commission_ledger) >= 5, 'finance sees everyone');
SELECT is((SELECT count(*) FROM public.exception_queue WHERE status = 'open')::int, 1, 'finance sees the exception queue');
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.exception_queue)::int, 0, 'employees do not');

-- ---------- append-only ----------
SELECT tests.clear_authentication();
SELECT throws_ok($$UPDATE public.commission_ledger SET gross_amount = 1$$, '42501', 'append_only', 'ledger is append-only even for postgres');
SELECT throws_ok($$DELETE FROM public.commission_ledger$$, '42501', 'append_only', 'ledger rows cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
