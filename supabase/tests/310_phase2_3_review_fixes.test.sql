-- ============================================================
-- Phase 2/3 review fixes (20261101150000)
-- ============================================================
BEGIN;
SELECT plan(32);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('comp@test.local', true) AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.create_user('gone@test.local', true) AS gone \gset
SELECT tests.employee_id(:'admin') AS e_admin, tests.employee_id(:'fin') AS e_fin, tests.employee_id(:'dl') AS e_dl,
       tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer,
       tests.employee_id(:'gone') AS e_gone \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_dl', 'DL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_tl', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_gone', 'FB', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_active(:'e_gone', false, 'Hat das Unternehmen verlassen');
SELECT date_trunc('month', app_private.business_today())::date AS m,
       (date_trunc('month', app_private.business_today()) - interval '1 month')::date AS m_prev \gset

-- ---------- P3-TEAM-01: team dashboard without pre-generated periods ----------
SELECT tests.clear_authentication();
DELETE FROM public.career_periods WHERE employee_id = :'e_fa';
SELECT tests.authenticate_as(:'tl');
SELECT is((public.rpc_dashboard_team() -> 'direct_reports' -> 0 ->> 'career_status'), 'in_progress',
  'P3-TEAM-01: a direct report without stored periods still gets a qualification status');
SELECT tests.clear_authentication();
SELECT ok(EXISTS (SELECT 1 FROM public.career_periods WHERE employee_id = :'e_fa'), 'P3-TEAM-01: the periods were generated on the way');

-- ---------- P3-GOAL-01: can_review ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_goal_draft(:'m', '{"points": 20, "kv_points": 2}') AS g \gset
SELECT public.rpc_submit_goal(:'g', 'Fokus KV');
SELECT is((SELECT can_review FROM public.v_goals WHERE id = :'g'), false, 'P3-GOAL-01: never your own goal');
SELECT tests.authenticate_as(:'tl');
SELECT is((SELECT can_review FROM public.v_goals WHERE id = :'g'), true, 'P3-GOAL-01: the direct manager may decide');
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT can_review FROM public.v_goals WHERE id = :'g'), true, 'P3-GOAL-01: an indirect manager may decide');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT is((SELECT count(*) FROM public.v_goals WHERE id = :'g')::int, 1, 'finance still sees the goal (RLS unchanged)');
SELECT is((SELECT can_review FROM public.v_goals WHERE id = :'g'), false, 'P3-GOAL-01: …but may not decide it');
SELECT tests.authenticate_as(:'comp');
SELECT is((SELECT can_review FROM public.v_goals WHERE id = :'g'), false, 'P3-GOAL-01: compliance may not decide');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is((SELECT can_review FROM public.v_goals WHERE id = :'g'), true, 'P3-GOAL-01: an admin with an employee record may decide');

-- ---------- P3-GOAL-02: bounded comments ----------
SELECT throws_ok(format($$SELECT public.rpc_review_goal(%L, 'returned', repeat('x', 4001))$$, :'g'),
  '22023', 'text_too_long', 'P3-GOAL-02: a review comment is capped at 4,000 characters');
SELECT public.rpc_review_goal(:'g', 'returned', 'Bitte KV auf 3 erhöhen');
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_goal_draft(:'m', '{"points": 20, "kv_points": 3}');
SELECT throws_ok(format($$SELECT public.rpc_submit_goal(%L, repeat('y', 4001))$$, :'g'),
  '22023', 'text_too_long', 'P3-GOAL-02: a submission comment is capped at 4,000 characters');
SELECT lives_ok(format($$SELECT public.rpc_submit_goal(%L, repeat('y', 4000))$$, :'g'), '…4,000 is fine');

-- ---------- P3-COACH-01: bounded texts, named errors ----------
SELECT tests.authenticate_as(:'tl');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Gespräch', repeat('p', 501))$$, :'e_fa'),
  '22023', 'text_too_long', 'P3-COACH-01: participants capped at 500');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', repeat('s', 4001))$$, :'e_fa'),
  '22023', 'text_too_long', 'P3-COACH-01: summary capped at 4,000');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Gespräch', NULL, NULL, '[{"title": "x y z", "owner": "boss"}]')$$, :'e_fa'),
  '22023', 'invalid_input', 'P3-COACH-01: unknown action owner → invalid_input');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Gespräch', NULL, '2026-09-01')$$, :'e_fa'),
  '22023', 'invalid_input', 'P3-COACH-01: next review before the session → invalid_input');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_note(%L, 'secret', 'Notiz')$$, :'e_fa'),
  '22023', 'invalid_input', 'P3-COACH-01: unknown note visibility → invalid_input');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_note(%L, 'shared', repeat('n', 4001))$$, :'e_fa'),
  '22023', 'text_too_long', 'P3-COACH-01: note capped at 4,000');
SELECT lives_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Monatsgespräch', 'TL, FA', '2026-11-01', '[{"title": "Zwei KV-Termine", "owner": "employee"}]')$$, :'e_fa'),
  'a valid session still saves');

-- ---------- P3-COACH-02: can_coach ----------
SELECT is((public.rpc_performance_profile(:'e_fa') ->> 'can_coach')::boolean, true, 'P3-COACH-02: the manager may coach');
SELECT tests.authenticate_as(:'fa');
SELECT is((public.rpc_performance_profile(:'e_fa') ->> 'can_coach')::boolean, false, 'P3-COACH-02: not yourself');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is((public.rpc_performance_profile(:'e_fa') ->> 'can_coach')::boolean, false, 'P3-COACH-02: an admin outside the structure sees the profile but may not coach');

-- ---------- P2-EXPORT-01: finance exports need MFA ----------
SELECT tests.authenticate_as(:'fin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_log_export('statement_overview', jsonb_build_object('month', %L), 3)$$, :'m'),
  '42501', 'mfa_required', 'P2-EXPORT-01: the overview export needs a 2FA-confirmed session');
SELECT tests.authenticate_as(:'fa');
SELECT lives_ok(format($$SELECT public.rpc_log_export('statement', jsonb_build_object('month', %L), 2)$$, :'m'),
  'P2-EXPORT-01: the own statement export does not');
SELECT throws_ok(format($$SELECT public.rpc_log_export('statement_overview', jsonb_build_object('month', %L), 3)$$, :'m'),
  '42501', 'forbidden', 'employees cannot log finance exports');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT lives_ok(format($$SELECT public.rpc_log_export('statement_overview', jsonb_build_object('month', %L), 3)$$, :'m'),
  'P2-EXPORT-01: with MFA the overview export is recorded');

-- ---------- P2-SUBSIDY-01: inactive employees, bounded texts ----------
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, %L, 100, 'Volumen gedeckt', 'Zuschuss für ausgeschiedene Person')$$, :'e_gone', :'m'),
  'P0001', 'owner_inactive', 'P2-SUBSIDY-01: no subsidy for an inactive employee');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, %L, 600, 'Viel Umsatz', 'Erhöhung Monat', repeat('o', 501))$$, :'e_tl', :'m'),
  '22023', 'reason_too_long', 'P2-SUBSIDY-01: override reason capped at 500');
SELECT throws_ok(format($$SELECT public.rpc_set_subsidy(%L, %L, 100, repeat('c', 1001), 'Zuschuss Monat')$$, :'e_tl', :'m'),
  '22023', 'text_too_long', 'P2-SUBSIDY-01: coverage note capped at 1,000');

-- ---------- P2-TASK-01: subsidy review due (§11.2) ----------
SELECT public.rpc_set_subsidy(:'e_tl', :'m_prev', 400, 'Produktion deckt Zuschuss', 'Zuschuss Vormonat');
SELECT tests.clear_authentication();
SELECT app_private.run_subsidy_review_tasks() AS r1 \gset
SELECT is((:'r1'::jsonb ->> 'subsidy_review_open')::int, 1, 'P2-TASK-01: last month''s subsidy without a decision this month → one review task');
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'subsidy_review' AND status = 'open' AND owner_id = :'e_fin' AND linked_id = :'e_tl')::int, 1,
  'P2-TASK-01: owned by the finance user, linked to the employee');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT public.rpc_set_subsidy(:'e_tl', :'m', 0, 'Volumen nicht gedeckt', 'Kein Zuschuss in diesem Monat');
SELECT tests.clear_authentication();
SELECT app_private.run_subsidy_review_tasks();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'subsidy_review' AND status = 'open')::int, 0,
  'P2-TASK-01: the task closes once the month is decided (also with 0)');

SELECT * FROM finish();
ROLLBACK;
