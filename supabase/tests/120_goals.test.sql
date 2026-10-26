-- ============================================================
-- r1/p3/goals
-- ============================================================
BEGIN;
SELECT plan(27);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT date_trunc('month', app_private.business_today())::date AS m,
       (date_trunc('month', app_private.business_today()) + interval '1 month')::date AS m_next \gset

-- ---------- validation ----------
SELECT is(app_private.normalize_goal_targets('{"points": "20", "kv_points": 2, "sales": 4}', :'m'),
  '{"points": 20.00, "kv_points": 2.00, "sales": 4, "ae": 560.00}'::jsonb, 'numbers normalised, AE derived from points × 28');
SELECT throws_ok(format($$SELECT app_private.normalize_goal_targets('{"points": 5, "kv_points": 6}', %L)$$, :'m'),
  '22023', 'kv_above_points', 'KV target cannot exceed points');
SELECT throws_ok(format($$SELECT app_private.normalize_goal_targets('{"sales": 1.5}', %L)$$, :'m'),
  '22023', 'invalid_target_value', 'counts must be whole numbers');
SELECT throws_ok(format($$SELECT app_private.normalize_goal_targets('{"points": -1}', %L)$$, :'m'),
  '22023', 'invalid_target_value', 'no negative targets');
SELECT throws_ok(format($$SELECT app_private.normalize_goal_targets('{"bonus": 1}', %L)$$, :'m'),
  '22023', 'unknown_target', 'unknown keys rejected');
SELECT is(app_private.normalize_goal_targets('{"points": 10, "ae": 300, "offers": null}', :'m') ->> 'ae', '300.00', 'explicit AE kept; null ignored');

-- ---------- draft / submit ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_goal_draft(:'m', '{"points": 20, "kv_points": 2, "appointments_held": 12, "development_goal": "Einwandbehandlung üben"}') AS g \gset
SELECT is((SELECT status FROM public.monthly_goals WHERE id = :'g'), 'draft', 'draft created');
SELECT throws_ok($$SELECT public.rpc_save_goal_draft('2026-01-01', '{"points": 1}')$$, 'P0001', 'month_closed', 'past months are closed');
SELECT throws_ok(format($$SELECT public.rpc_save_goal_draft(%L, '{"points": 1}')$$, (:'m'::date + interval '4 months')::date),
  'P0001', 'month_too_far', 'at most two months ahead');
SELECT is(public.rpc_submit_goal(:'g', 'Fokus auf KV'), 1, 'first submission is version 1');
SELECT is((SELECT late FROM public.monthly_goals WHERE id = :'g'), app_private.business_today() > :'m'::date, 'late flag reflects submission after the 1st');
SELECT throws_ok(format($$SELECT public.rpc_save_goal_draft(%L, '{"points": 30}')$$, :'m'), 'P0001', 'awaiting_review', 'cannot edit while under review');
SELECT throws_ok(format($$SELECT public.rpc_review_goal(%L, 'approved')$$, :'g'), 'P0001', 'cannot_review_own', 'no self-approval');

-- empty goal
SELECT public.rpc_save_goal_draft(:'m_next', '{}') AS g_empty \gset
SELECT throws_ok(format($$SELECT public.rpc_submit_goal(%L)$$, :'g_empty'), 'P0001', 'goal_empty', 'empty goals cannot be submitted');

-- ---------- review ----------
SELECT tests.authenticate_as(:'peer');
SELECT throws_ok(format($$SELECT public.rpc_review_goal(%L, 'approved')$$, :'g'), '42501', 'forbidden', 'a peer cannot review');
SELECT is((SELECT count(*) FROM public.monthly_goals WHERE id = :'g')::int, 0, 'a peer cannot see the goal');

SELECT tests.authenticate_as(:'tl');
SELECT is((SELECT reviewer_id FROM public.v_goals WHERE id = :'g'), :'e_tl'::uuid, 'responsible reviewer is the direct manager');
SELECT throws_ok(format($$SELECT public.rpc_review_goal(%L, 'returned', 'x')$$, :'g'), '23514', NULL, 'returning needs a comment');
SELECT public.rpc_review_goal(:'g', 'returned', 'KV-Ziel bitte auf 3 erhöhen');
SELECT is((SELECT jsonb_build_array(status, last_review_comment) FROM public.v_goals WHERE id = :'g'),
  '["returned", "KV-Ziel bitte auf 3 erhöhen"]'::jsonb, 'returned with the manager''s comment (§14.5)');

SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_goal_draft(:'m', '{"points": 20, "kv_points": 3}');
SELECT is(public.rpc_submit_goal(:'g'), 2, 'resubmission creates version 2');
SELECT is((SELECT count(*) FROM public.monthly_goal_versions WHERE goal_id = :'g')::int, 2, 'both versions kept');
SELECT is((SELECT targets ->> 'kv_points' FROM public.monthly_goal_versions WHERE goal_id = :'g' AND version = 1), '2.00', 'version 1 unchanged');

-- a higher ancestor may approve too (manager absent)
SELECT tests.authenticate_as(:'dl');
SELECT public.rpc_review_goal(:'g', 'approved', 'Passt');
SELECT is((SELECT status FROM public.monthly_goals WHERE id = :'g'), 'approved', 'approved by an indirect manager');
SELECT throws_ok(format($$SELECT public.rpc_review_goal(%L, 'approved')$$, :'g'), 'P0001', 'invalid_status', 'cannot approve twice');

-- inactive manager → reviewer moves up
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_employee_active(:'e_tl', false, 'Elternzeit bis Jahresende');
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT reviewer_id FROM public.v_goals WHERE id = :'g'), :'e_dl'::uuid, 'inactive manager is skipped as reviewer');

-- ---------- guards ----------
SELECT tests.clear_authentication();
SELECT throws_ok($$UPDATE public.monthly_goal_versions SET targets = '{}'$$, '42501', 'append_only', 'versions are immutable');
SELECT throws_ok($$DELETE FROM public.goal_reviews$$, '42501', 'append_only', 'reviews are immutable');

SELECT * FROM finish();
ROLLBACK;
