-- ============================================================
-- r1/p4/task-engine
-- ============================================================
BEGIN;
SELECT plan(28);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa,
       tests.employee_id(:'peer') AS e_peer, tests.employee_id(:'fin') AS e_fin \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');

-- ---------- manual tasks ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_task(:'e_fa', 'Kunden Müller zurückrufen') AS t_own \gset
SELECT throws_ok(format($$SELECT public.rpc_create_task(%L, 'Für den Chef')$$, :'e_tl'), '42501', 'forbidden', 'cannot create tasks for a manager');
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_create_task(:'e_fa', 'Unterlagen für Termin vorbereiten', NULL, now() + interval '1 day', 'high') AS t_assigned \gset
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.tasks)::int, 2, 'employee sees own and assigned tasks');
SELECT is((SELECT count(*) FROM public.notifications WHERE kind = 'manual')::int, 1, 'assignment by the manager notifies the employee');
SELECT public.rpc_set_task_status(:'t_assigned', 'done', 'Erledigt');
SELECT ok((SELECT completed_at IS NOT NULL FROM public.tasks WHERE id = :'t_assigned'), 'done sets completed_at');
SELECT public.rpc_set_task_status(:'t_assigned', 'open');
SELECT ok((SELECT completed_at IS NULL FROM public.tasks WHERE id = :'t_assigned'), 'reopening clears completed_at');
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.tasks)::int, 0, 'peers see no tasks');
SELECT throws_ok(format($$SELECT public.rpc_set_task_status(%L, 'done')$$, :'t_own'), '42501', 'forbidden', 'peers cannot complete them');
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT count(*) FROM public.tasks WHERE owner_id = :'e_fa')::int, 2, 'indirect manager sees the team''s tasks');
SELECT throws_ok(format($$SELECT public.rpc_reassign_task(%L, %L, 'kurz')$$, :'t_own', :'e_tl'), '22023', 'reason_required', 'reassignment needs a reason');
SELECT public.rpc_reassign_task(:'t_own', :'e_tl', 'Urlaub der Beraterin, TL übernimmt');
SELECT is((SELECT owner_id FROM public.tasks WHERE id = :'t_own'), :'e_tl'::uuid, 'reassigned');

-- ---------- generators: goal review ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_save_goal_draft(date_trunc('month', app_private.business_today())::date, '{"points": 10}') AS g \gset
SELECT public.rpc_submit_goal(:'g');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT owner_id FROM public.tasks WHERE type = 'goal_review' AND status = 'open'), :'e_tl'::uuid, 'submitted goal → review task for the manager');
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'goal_review')::int, 1, 'generators are idempotent');
SELECT ok((SELECT critical FROM public.notifications WHERE kind = 'goal_review' LIMIT 1), 'goal review notifications are critical');
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_review_goal(:'g', 'approved');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT status FROM public.tasks WHERE type = 'goal_review'), 'cancelled', 'task closes when the goal is reviewed');

-- ---------- generators: overdue coaching action ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_add_coaching_session(:'e_fa', '2026-10-01', 'Gespräch zu KV', NULL, NULL,
  '[{"title": "Drei KV-Termine", "owner": "employee", "due_on": "2026-10-10"}]');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT owner_id FROM public.tasks WHERE type = 'coaching_action' AND status = 'open'), :'e_fa'::uuid, 'overdue action → task for its owner');
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_set_coaching_action_status((SELECT id FROM public.coaching_actions LIMIT 1), 'done');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'coaching_action' AND status = 'open')::int, 0, 'closes once the action is done');

-- ---------- generators: calculation exception → finance ----------
INSERT INTO public.exception_queue (entity_type, entity_id, reason_code) VALUES ('public.point_calculations', gen_random_uuid()::text, 'producer_without_level');
SELECT app_private.run_task_generators();
SELECT is((SELECT owner_id FROM public.tasks WHERE type = 'calculation_exception' AND status = 'open'), :'e_fin'::uuid, 'exception → task for finance');
UPDATE public.exception_queue SET status = 'resolved', resolved_at = now();
SELECT app_private.run_task_generators();
SELECT is((SELECT status FROM public.tasks WHERE type = 'calculation_exception'), 'cancelled', 'closes once resolved');

-- ---------- reassignment of inactive owners ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_employee_active(:'e_tl', false, 'Elternzeit ab sofort');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT owner_id FROM public.tasks WHERE id = :'t_own'), :'e_dl'::uuid, 'open tasks of inactive people move to the next active manager');
SELECT ok(EXISTS (SELECT 1 FROM public.notifications WHERE recipient_id = :'e_dl' AND kind = 'reassignment'), 'and the manager is notified');

-- ---------- notifications ----------
SELECT tests.authenticate_as(:'fa');
SELECT is(public.rpc_set_muted_notifications(ARRAY['manual', 'goal_review']), ARRAY['manual'], 'critical kinds cannot be muted');
SELECT tests.authenticate_as(:'dl');
SELECT public.rpc_create_task(:'e_fa', 'Leise Aufgabe ohne Benachrichtigung');
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.notifications WHERE kind = 'manual')::int, 1, 'muted kinds create no new notification');
SELECT ok((SELECT count(*) FROM public.tasks WHERE title LIKE 'Leise%') = 1, '…but the task still exists');
SELECT ok(public.rpc_mark_notifications_read() >= 1, 'mark all as read');
SELECT is((SELECT count(*) FROM public.notifications WHERE read_at IS NULL)::int, 0, 'nothing unread');
SELECT tests.authenticate_as(:'dl');
SELECT ok((SELECT bool_and(recipient_id = :'e_dl') FROM public.notifications), 'notifications are private to the recipient');

-- ---------- admin trigger ----------
SELECT throws_ok($$SELECT public.rpc_run_task_generators()$$, '42501', 'forbidden', 'only admins can trigger the generators');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT ok(public.rpc_run_task_generators() ? 'open_system_tasks', 'admin can run them on demand');

SELECT * FROM finish();
ROLLBACK;
