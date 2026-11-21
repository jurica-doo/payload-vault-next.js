-- ============================================================
-- Rules "Stand 01.11.2026" (migration 20261101140000)
-- Profina Karriereplan (Anlage 2) + Provisionssätze (Anlage 1):
-- AE-first conversion, Kfz/Rechtsschutz, no LV cap, cap from FB on,
-- VD+/GM appointed only; Kfz without points, Rechtsschutz with commission (2026-11-21).
-- Golden IDs are shared with src/domain/points.test.ts.
-- ============================================================
BEGIN;
SELECT plan(27);

SET LOCAL app.business_today = '2026-11-20';

CREATE FUNCTION pg_temp.golden(p_cat text, p_premium numeric, p_period text, p_ng text, p_term numeric,
                               p_day date DEFAULT '2026-11-15')
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN (r ->> 'ok')::boolean
              THEN concat_ws('|', r ->> 'points', r ->> 'ae', r ->> 'kv_points')
              ELSE 'error:' || (r ->> 'error') END
    FROM (SELECT app_private.calculate_points(p_cat, p_premium, p_period, p_ng, 'EUR', p_term, p_day) AS r) x
$$;

-- ---------- versions ----------
SELECT isnt(app_private.rule_version_at('conversion', '2026-11-01'), app_private.rule_version_at('conversion', '2026-10-31'),
  'a new conversion version starts on 2026-11-01');
SELECT isnt(app_private.rule_version_at('levels', '2026-11-01'), app_private.rule_version_at('levels', '2026-10-31'),
  'a new levels version starts on 2026-11-01');
SELECT is((SELECT divisor_unit FROM public.rule_versions WHERE id = app_private.rule_version_at('conversion', '2026-11-01')), 'ae',
  'the new conversion version divides into AE');
SELECT is((SELECT divisor_unit FROM public.rule_versions WHERE id = app_private.rule_version_at('conversion', '2026-10-31')), 'points',
  'the old conversion version is unchanged');

-- ---------- golden cases ----------
SELECT is(pg_temp.golden('LV', 100, 'monthly', NULL, 35), '10.4996|293.99|0.0000',
  'GC-POINTS-101 LV 100 €/month, 35 years: 42.000 ÷ 142,86 = 293,99 AE → 10,4996 P');
SELECT is(pg_temp.golden('LV', 100, 'monthly', NULL, 40), '11.9996|335.99|0.0000',
  'GC-POINTS-102 LV term 40: no cap any more (OD-06)');
SELECT is(pg_temp.golden('KV', 700, 'monthly', NULL, NULL), '25.0000|700.00|25.0000',
  'GC-POINTS-103 KV 700 €/month ÷ 1,00 = 700 AE → 25 P, tagged KV');
SELECT is(pg_temp.golden('SACH', 1000, 'annual', 'net', NULL), '4.9950|139.86|0.0000',
  'GC-POINTS-104 Sach 1.000 € ÷ 7,15 = 139,86 AE → 4,995 P');
SELECT is(pg_temp.golden('KFZ', 1000, 'annual', 'net', NULL), '0.0000|0.00|0.0000',
  'GC-POINTS-105 Kfz: currently no points (Profina 2026-11-21, switchable)');
SELECT is(pg_temp.golden('RS', 500, 'annual', 'net', NULL), '2.4975|69.93|0.0000',
  'GC-POINTS-106 Rechtsschutz 500 € ÷ 7,15 = 69,93 AE → 2,4975 P');
SELECT is(pg_temp.golden('STROM', 80, 'monthly', NULL, NULL), '0.0000|0.00|0.0000',
  'GC-POINTS-107 Strom → 0 (OD-18 open)');
SELECT is(pg_temp.golden('KFZ', 1000, 'annual', 'gross', NULL), 'error:net_premium_required',
  'GC-POINTS-108 Kfz needs the net annual premium');
SELECT is(pg_temp.golden('RS', 500, 'annual', 'net', NULL, '2026-10-31'), 'error:unknown_category',
  'GC-POINTS-109 Rechtsschutz did not exist before 2026-11-01');
SELECT is(pg_temp.golden('KV', 333.33, 'monthly', NULL, NULL), '11.9046|333.33|11.9046',
  'GC-POINTS-110 KV 333,33 → 333,33 AE → 11,9046 P');

SELECT is(app_private.calculate_points('LV', 100, 'monthly', NULL, 'EUR', 40, '2026-11-15') -> 'details' ->> 'formula',
  '100 × 12 × 40 ÷ 142.86 = 335.99 AE; 335.99 AE ÷ 28', 'formula text matches the TypeScript preview');

-- ---------- levels ----------
SELECT is((SELECT array_agg(code ORDER BY rank) FROM public.career_levels
            WHERE rule_version_id = app_private.rule_version_at('levels', '2026-11-01')),
  ARRAY['FA', 'FB', 'TL', 'OL', 'DL', 'RL', 'VD', 'VDP', 'GM'], 'nine levels incl. VD+ and GM');
SELECT is((SELECT array_agg(code ORDER BY rank) FROM public.career_levels
            WHERE rule_version_id = app_private.rule_version_at('levels', '2026-11-01') AND appointed_only),
  ARRAY['VDP', 'GM'], 'VD+ and GM are appointed only');
SELECT is((SELECT array_agg(code ORDER BY rank) FROM public.career_levels
            WHERE rule_version_id = app_private.rule_version_at('levels', '2026-11-01') AND structure_cap_ratio = 0.5),
  ARRAY['FB', 'TL', 'OL', 'DL', 'RL', 'VD'], '50 % clause on every qualification target (OD-04)');

-- ---------- people ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.grant_role(:'admin', 'finance');
SELECT tests.create_user('vd@test.local', true) AS vd \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.employee_id(:'vd') AS e_vd, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_vd', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_vd', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_vd', 'VD', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_tl', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_generate_all_periods();

SELECT tests.clear_authentication();
SELECT is(app_private.compute_qualification(:'e_vd', '2026-11-20') ->> 'status', 'top_level',
  'VD has no automatic target: VD+ is appointed');
SELECT is((app_private.compute_qualification(:'e_fa', '2026-11-20') ->> 'cap_value')::numeric, 50::numeric,
  'FA → FB: one structure counts at most 50 P');

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT lives_ok(format($$SELECT public.rpc_set_employee_level(%L, 'VDP', '2026-11-20', 'Ernennung durch die Geschäftsführung')$$, :'e_vd'),
  'VD+ can be set as a level (appointment)');

-- ---------- commission ----------
CREATE FUNCTION pg_temp.produce(p_emp uuid, p_cat text, p_premium numeric, p_period text, p_ng text, p_date date)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.rpc_save_production(NULL, p_emp, p_cat, p_premium, p_period, p_ng, NULL, p_date);
  PERFORM public.rpc_submit_production(v);
  PERFORM public.rpc_mark_production_eligible(v);
  RETURN v;
END $$;

SELECT pg_temp.produce(:'e_fa', 'KFZ', 1000, 'annual', 'net', '2026-11-10') AS p_kfz \gset
SELECT pg_temp.produce(:'e_fa', 'RS', 500, 'annual', 'net', '2026-11-10') AS p_rs \gset
SELECT pg_temp.produce(:'e_fa', 'SACH', 1000, 'annual', 'net', '2026-11-10') AS p_sach \gset
SELECT tests.clear_authentication();

SELECT is((SELECT points FROM public.point_calculations WHERE production_id = :'p_kfz'), 0.0000::numeric,
  'Kfz creates no career points for now');
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p_kfz')::int, 0,
  'Kfz books no commission per point');
SELECT is((SELECT sum(gross_amount) FROM public.commission_ledger WHERE production_id = :'p_rs'), 359.65::numeric,
  'Rechtsschutz books commission per point (2,4975 P: 69,93 + 104,90 + 184,82, each rounded)');
SELECT is((SELECT count(*) FROM public.exception_queue
            WHERE entity_type = 'public.point_calculations'
              AND entity_id IN (SELECT id::text FROM public.point_calculations WHERE production_id IN (:'p_kfz', :'p_rs')))::int, 0,
  'and raises no exception for it');
SELECT is((SELECT sum(gross_amount) FROM public.commission_ledger WHERE production_id = :'p_sach'), 719.28::numeric,
  'Sach still books (4,995 P × VD rate 144 €, provisional OD-05)');

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_cancel_production(:'p_kfz', 'Vertrag vom Kunden widerrufen');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p_kfz')::int, 0,
  'cancelling Kfz books no reversal either');

SELECT * FROM finish();
ROLLBACK;
