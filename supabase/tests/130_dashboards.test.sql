-- ============================================================
-- r1/p3/dashboards
-- ============================================================
BEGIN;
SELECT plan(18);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.grant_role(:'admin', 'finance');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('loose@test.local', true) AS loose \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'loose') AS e_loose \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fb', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_fb', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_tl', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fb', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');

CREATE FUNCTION pg_temp.produce(p_emp uuid, p_premium numeric, p_date date) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.rpc_save_production(NULL, p_emp, 'KV', p_premium, 'monthly', NULL, NULL, p_date);
  PERFORM public.rpc_submit_production(v);
  PERFORM public.rpc_mark_production_eligible(v);
  RETURN v;
END $$;

SELECT date_trunc('month', app_private.business_today())::date AS m \gset
SELECT pg_temp.produce(:'e_fa', 280, :'m');                                    -- 10 P this month
-- 5 P last month
SELECT pg_temp.produce(:'e_fa', 140, (:'m'::date - interval '1 month')::date) AS prev \gset
SELECT pg_temp.produce(:'e_fb', 560, :'m');                                    -- 20 P this month
SELECT public.rpc_save_production(NULL, :'e_fa', 'KV', 28, 'monthly', NULL, NULL, :'m');  -- a draft, not counted

-- ---------- employee ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_goal_draft(:'m', '{"points": 20, "kv_points": 2}');
SELECT public.rpc_dashboard_me() AS d \gset
SELECT is((:'d'::jsonb -> 'production' ->> 'points')::numeric, 10::numeric, 'month points from eligible production only');
SELECT is((:'d'::jsonb -> 'production' ->> 'kv_points')::numeric, 10::numeric, 'KV points for the month');
SELECT is((:'d'::jsonb -> 'year' ->> 'points')::numeric,
  CASE WHEN extract(month FROM :'m'::date) = 1 THEN 10 ELSE 15 END::numeric, 'year to date');
SELECT is(jsonb_array_length(:'d'::jsonb -> 'trend'), 6, 'six-month trend');
SELECT is((:'d'::jsonb -> 'trend' -> 5 ->> 'points')::numeric, 10::numeric, 'trend ends with the current month');
SELECT is(:'d'::jsonb -> 'goal' ->> 'status', 'draft', 'goal status included');
SELECT is((:'d'::jsonb -> 'goal' -> 'targets' ->> 'points')::numeric, 20::numeric, 'goal targets included');
SELECT is(:'d'::jsonb -> 'career' ->> 'target', 'FB', 'career summary included');
SELECT is((:'d'::jsonb -> 'commission' ->> 'gross')::numeric, 420.00::numeric, 'commission booked this month (280 + 140)');
SELECT is((:'d'::jsonb -> 'todo' ->> 'drafts')::int, 1, 'open drafts counted');

-- cancellation flows through
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_cancel_production(:'prev', 'Storno durch Kunden');
SELECT tests.authenticate_as(:'fa');
SELECT is((public.rpc_dashboard_me() -> 'trend' -> 4 ->> 'points')::numeric, 0::numeric, 'a cancelled contract disappears from the trend');

-- ---------- team ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_dashboard_team() AS t \gset
SELECT is(jsonb_array_length(:'t'::jsonb -> 'direct_reports'), 1, 'one direct report');
SELECT is((:'t'::jsonb -> 'direct_reports' -> 0 -> 'own' ->> 'points')::numeric, 20::numeric, 'FB''s own production');
SELECT is((:'t'::jsonb -> 'direct_reports' -> 0 -> 'structure' ->> 'points')::numeric, 10::numeric, 'FB''s structure (FA)');
SELECT is((:'t'::jsonb -> 'structure_total' ->> 'points')::numeric, 30::numeric, 'whole structure total');

SELECT tests.authenticate_as(:'fb');
SELECT is((public.rpc_dashboard_me() -> 'todo' ->> 'goals_to_review')::int, 0, 'no submitted goals yet');

-- ---------- admin ----------
SELECT throws_ok($$SELECT public.rpc_dashboard_admin()$$, '42501', 'forbidden', 'admin dashboard is not for employees');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT ok((SELECT public.rpc_dashboard_admin() -> 'without_level' @> jsonb_build_array(jsonb_build_object('id', :'e_loose', 'name', 'Loose Test'))),
  'data quality lists active people without a level');

SELECT * FROM finish();
ROLLBACK;
