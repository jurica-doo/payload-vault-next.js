-- ============================================================
-- r1/p1/career-engine
-- ============================================================
BEGIN;
SELECT plan(51);

CREATE FUNCTION pg_temp.plan_str(p_start date, p_until date) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(period_type || ':' || start_date || '..' || end_date, ' ' ORDER BY start_date)
    FROM app_private.period_plan(p_start, p_until)
$$;

-- "eligible|eligible_kv|ready|kv_missing", numbers without trailing zeros
CREATE FUNCTION pg_temp.rules_str(p_threshold numeric, p_kv numeric, p_cap numeric, p_pp numeric, p_pk numeric, p_s jsonb)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', trim_scale((r ->> 'eligible')::numeric), trim_scale((r ->> 'eligible_kv')::numeric),
                   r ->> 'is_ready', trim_scale((r ->> 'kv_missing')::numeric))
    FROM (SELECT app_private.apply_career_rules(p_threshold, p_kv, p_cap, p_pp, p_pk, p_s) AS r) x
$$;

-- ---------- golden: periods (shared with src/domain/careerPeriods.test.ts) ----------
SELECT is(pg_temp.plan_str('2026-11-01', '2028-06-01'),
  'first_personal:2026-11-01..2027-11-01 transition:2027-11-01..2028-01-01 calendar:2028-01-01..2029-01-01',
  'GC-PERIOD-001 spec example: start 1 Nov 2026 → personal year, transition, calendar 2028 (§4.1/§4.2)');
SELECT is(pg_temp.plan_str('2026-01-01', '2027-03-01'),
  'first_personal:2026-01-01..2027-01-01 calendar:2027-01-01..2028-01-01',
  'GC-PERIOD-002 start on 1 January → no transition period');
SELECT is(pg_temp.plan_str('2028-02-29', '2030-06-01'),
  'first_personal:2028-02-29..2029-03-01 transition:2029-03-01..2030-01-01 calendar:2030-01-01..2031-01-01',
  'GC-PERIOD-003 start on 29 February → first year ends 1 March');
SELECT is(pg_temp.plan_str('2026-12-31', '2027-12-31'),
  'first_personal:2026-12-31..2027-12-31 transition:2027-12-31..2028-01-01',
  'GC-PERIOD-004 start on 31 December → one-day transition');
SELECT is(pg_temp.plan_str('2027-03-01', '2026-10-26'),
  'first_personal:2027-03-01..2028-03-01',
  'GC-PERIOD-005 future start → only the first period');

-- ---------- golden: rules (shared with src/domain/qualification.test.ts) ----------
SELECT is(pg_temp.rules_str(100, 0.10, NULL, 100, 7, '[]'), '100|7|false|3',
  'GC-CAREER-001 FB candidate with 100 P but 7 KV is not qualified, 3 KV missing (§14.4)');
SELECT is(pg_temp.rules_str(100, 0.10, NULL, 100, 10, '[]'), '100|10|true|0',
  'GC-CAREER-002 with 10 KV points the candidate is ready (§14.4)');
SELECT is(pg_temp.rules_str(750, 0.10, 0.5, 0, 0, '[{"id":"A","points":"800","kv":"0"}]'), '375|0|false|75',
  'GC-CAREER-003 750 target: one structure with 800 P counts 375 (§4.5/§14.4)');
SELECT is(pg_temp.rules_str(750, 0.10, 0.5, 100, 0, '[{"id":"A","points":"800","kv":"80"},{"id":"B","points":"300","kv":"40"}]'),
  '775|77.5|true|0', 'GC-CAREER-004 capped structure keeps its KV share proportionally (OD-03)');
SELECT is(pg_temp.rules_str(300, 0.10, NULL, 0, 0, '[{"id":"A","points":"800","kv":"30"}]'), '800|30|true|0',
  'GC-CAREER-005 no cap below OL (OD-04)');
SELECT is(pg_temp.rules_str(100, 0.10, NULL, -10, -1, '[{"id":"A","points":"-5","kv":"0"}]'), '0|0|false|10',
  'GC-CAREER-006 negative nets (reversals) count as 0');
SELECT is(pg_temp.rules_str(750, 0.10, 0.5, 0, 0, '[{"id":"A","points":"375","kv":"50"}]'), '375|50|false|25',
  'GC-CAREER-007 exactly at the cap');
SELECT is((app_private.apply_career_rules(750, 0.10, 0.5, 0, 0, '[{"id":"A","points":"375","kv":"50"}]') -> 'structures' -> 0 ->> 'cap_applied'),
  'false', 'exactly at the cap is not "capped"');

-- ---------- fixtures ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.grant_role(:'admin', 'finance');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('tl2@test.local', true) AS tl2 \gset
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('cand@test.local', true) AS cand \gset
SELECT tests.create_user('vd@test.local', true) AS vd \gset
SELECT tests.create_user('nolevel@test.local', true) AS nolevel \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'tl2') AS e_tl2,
       tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'cand') AS e_cand,
       tests.employee_id(:'vd') AS e_vd, tests.employee_id(:'nolevel') AS e_nolevel \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl2', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_fb', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_dl', 'DL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_tl', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_tl2', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fb', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_cand', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_vd', 'VD', '2026-01-01', 'Einstieg laut Vertrag');

-- Enters, submits and confirms production as the admin/finance user.
CREATE FUNCTION pg_temp.produce(p_emp uuid, p_cat text, p_premium numeric, p_period text, p_ng text, p_date date)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.rpc_save_production(NULL, p_emp, p_cat, p_premium, p_period, p_ng, NULL, p_date);
  PERFORM public.rpc_submit_production(v);
  PERFORM public.rpc_mark_production_eligible(v);
  RETURN v;
END $$;

-- ---------- §14.4: FB candidate with 7 KV points ----------
SELECT pg_temp.produce(:'e_cand', 'SACH', 18600, 'annual', 'net', '2026-03-01');   -- 93 P
SELECT pg_temp.produce(:'e_cand', 'KV', 196, 'monthly', NULL, '2026-03-02');       -- 7 P, KV
SELECT public.rpc_career_progress(:'e_cand') AS q1 \gset
SELECT is(:'q1'::jsonb ->> 'target', 'FB', 'FA targets FB');
SELECT is((:'q1'::jsonb ->> 'eligible')::numeric, 100::numeric, '100 points credited');
SELECT is((:'q1'::jsonb ->> 'eligible_kv')::numeric, 7::numeric, '7 KV points credited');
SELECT is(:'q1'::jsonb ->> 'status', 'in_progress', 'not qualified with 7 KV points (§14.4)');
SELECT is((:'q1'::jsonb ->> 'kv_missing')::numeric, 3::numeric, '3 KV points missing');
SELECT is(:'q1'::jsonb -> 'period' ->> 'type', 'first_personal', 'counts in the first personal year');
SELECT throws_ok(format($$SELECT public.rpc_approve_promotion(%L, 'Beförderung nach Prüfung')$$, :'e_cand'),
  'P0001', 'not_qualified', 'cannot promote someone who is not ready');

SELECT pg_temp.produce(:'e_cand', 'KV', 84, 'monthly', NULL, '2026-03-03');        -- 3 P, KV
SELECT is(public.rpc_career_progress(:'e_cand') ->> 'status', 'ready', 'ready once 10 KV points are reached (§14.4)');
SELECT ok(EXISTS (SELECT 1 FROM public.rpc_promotion_queue() q WHERE q ->> 'employee_id' = :'e_cand'), 'appears in the promotion queue');

SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_approve_promotion(%L, 'Beförderung nach Prüfung')$$, :'e_cand'),
  '42501', 'mfa_required', 'approval needs MFA');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is(public.rpc_approve_promotion(:'e_cand', 'Beförderung nach Prüfung der Unterlagen'), 'FB', 'promoted to FB');
SELECT is(app_private.level_at(:'e_cand', app_private.business_today()), 'FB', 'level is FB from today');
SELECT is((SELECT evidence ->> 'eligible_kv' FROM public.career_level_history WHERE employee_id = :'e_cand' AND source = 'promotion'),
  '10.0000', 'evidence stores the calculation');
SELECT is(public.rpc_career_progress(:'e_cand') ->> 'target', 'TL', 'next target is TL');
SELECT is((public.rpc_career_progress(:'e_cand') ->> 'eligible')::numeric, 0::numeric,
  'points restart after a promotion (no carry-over, OD-02)');
SELECT throws_ok(format($$SELECT public.rpc_approve_promotion(%L, 'Gleich noch eine Stufe')$$, :'e_cand'),
  'P0001', 'not_qualified', 'one level at a time');

-- ---------- §4.5: 50 % structure cap ----------
-- 800 P by FA
SELECT pg_temp.produce(:'e_fa', 'SACH', 160000, 'annual', 'net', '2026-03-01') AS big \gset
SELECT public.rpc_career_progress(:'e_tl') AS q2 \gset
SELECT is(:'q2'::jsonb ->> 'target', 'OL', 'TL targets OL');
SELECT is((:'q2'::jsonb ->> 'eligible')::numeric, 375::numeric, 'only 375 of 800 points from one structure (§14.4)');
SELECT is(:'q2'::jsonb -> 'structures' -> 0 ->> 'id', :'e_fb', 'FA''s production counts in FB''s structure');
SELECT is(:'q2'::jsonb -> 'structures' -> 0 ->> 'cap_applied', 'true', 'cap flagged');
SELECT is((:'q2'::jsonb ->> 'cap_value')::numeric, 375::numeric, 'cap value = 50 % of 750');
SELECT is((public.rpc_career_progress(:'e_fb') ->> 'eligible')::numeric, 800::numeric, 'FB (target TL, no cap) gets all 800');
SELECT is((public.rpc_career_progress(:'e_dl') -> 'structures' -> 0 ->> 'id'), :'e_tl', 'DL sees it in TL''s structure');

-- ---------- attribution by production date (transfer) ----------
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl2', '2026-06-01', 'Wechsel ins Team Süd');
SELECT pg_temp.produce(:'e_fa', 'SACH', 20000, 'annual', 'net', '2026-07-01');   -- 100 P after the transfer
SELECT is((public.rpc_career_progress(:'e_tl') ->> 'eligible')::numeric, 375::numeric,
  'production after the transfer does not count for the old leader');
SELECT is((public.rpc_career_progress(:'e_tl2') ->> 'eligible')::numeric, 100::numeric,
  'production after the transfer counts for the new leader');
SELECT is((public.rpc_career_progress(:'e_tl2') -> 'structures' -> 0 ->> 'gross')::numeric, 100::numeric,
  'earlier production stays with the old structure');

-- ---------- cancellation flows through immediately ----------
SELECT public.rpc_cancel_production(:'big', 'Vertrag widerrufen durch Kunden');
SELECT is((public.rpc_career_progress(:'e_tl') ->> 'eligible')::numeric, 0::numeric, 'cancelled production no longer counts');

-- ---------- blocked states ----------
SELECT is(public.rpc_career_progress(:'e_nolevel') ->> 'reason', 'no_level', 'no level → blocked, nothing guessed');
SELECT is(public.rpc_career_progress(:'e_vd') ->> 'status', 'top_level', 'VD has no next level');

-- ---------- visibility ----------
SELECT tests.authenticate_as(:'fa');
SELECT is(public.rpc_career_progress() ->> 'target', 'FB', 'own progress without an argument');
SELECT throws_ok(format($$SELECT public.rpc_career_progress(%L)$$, :'e_tl'), '42501', 'forbidden', 'cannot see a manager''s progress');
SELECT tests.authenticate_as(:'tl2');
SELECT lives_ok(format($$SELECT public.rpc_career_progress(%L)$$, :'e_fa'), 'leader can see a structure member''s progress');
SELECT tests.authenticate_as(:'cand');
SELECT throws_ok($$SELECT * FROM public.rpc_promotion_queue()$$, '42501', 'forbidden', 'queue is admin-only');
SELECT is((SELECT count(*) FROM public.career_periods)::int, 1, 'employee sees only their own periods');

-- ---------- periods ----------
SELECT tests.clear_authentication();
SELECT is((SELECT count(*) FROM public.career_periods WHERE employee_id = :'e_cand')::int, 1, 'periods generated up to today');
SELECT throws_ok(format($$INSERT INTO public.career_periods (employee_id, period_type, start_date, end_date) VALUES (%L, 'calendar', '2026-06-01', '2027-06-01')$$, :'e_cand'),
  '23P01', NULL, 'periods cannot overlap');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_update_employee(:'e_nolevel', 'Nola', 'Test', NULL, '2026-02-01', 'full_time', 'Eintrittsdatum korrigiert');
SELECT public.rpc_career_progress(:'e_nolevel');
SELECT is((SELECT start_date FROM public.career_periods WHERE employee_id = :'e_nolevel' AND period_type = 'first_personal'),
  '2026-02-01'::date, 'changing the start date regenerates the periods');
SELECT is(public.rpc_generate_all_periods() >= 9, true, 'admin can generate periods for everyone');

SELECT * FROM finish();
ROLLBACK;
