-- ============================================================
-- r1/p3/profiles-coaching
-- ============================================================
BEGIN;
SELECT plan(27);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('dl@test.local', true) AS dl \gset
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'dl') AS e_dl, tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_dl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_tl', :'e_dl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');

-- ---------- sessions and actions ----------
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Selbstgespräch')$$, :'e_fa'),
  '42501', 'forbidden', 'employees cannot write their own coaching');
SELECT tests.authenticate_as(:'peer');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Fremdes Gespräch')$$, :'e_fa'),
  '42501', 'forbidden', 'non-managers cannot coach');

SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_add_coaching_session(:'e_fa', '2026-10-01', 'Monatsgespräch: Fokus KV-Beratung', 'TL, FA', '2026-11-01',
  '[{"title": "Zwei KV-Termine pro Woche", "owner": "employee", "due_on": "2026-10-15"},
    {"title": "Gesprächsleitfaden schicken", "owner": "leader", "due_on": "2026-10-05"}]') AS s \gset
SELECT is((SELECT count(*) FROM public.coaching_actions WHERE session_id = :'s')::int, 2, 'session with two agreed actions');
SELECT is((SELECT owner_id FROM public.coaching_actions WHERE title LIKE 'Zwei%'), :'e_fa'::uuid, 'action owned by the employee');
SELECT is((SELECT owner_id FROM public.coaching_actions WHERE title LIKE 'Gespräch%'), :'e_tl'::uuid, 'action owned by the leader');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, %L, 'Zukunft')$$, :'e_fa', app_private.business_today() + 1),
  'P0001', 'date_in_future', 'sessions cannot be in the future');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_session(%L, '2026-10-01', 'Ungültige Aktion', NULL, NULL, '[{"title": "x y z", "owner": "boss"}]')$$, :'e_fa'),
  '22023', 'invalid_payload', 'unknown action owner rejected');

-- ---------- notes ----------
SELECT public.rpc_add_coaching_note(:'e_fa', 'private_manager', 'Wirkt unsicher bei Einwänden; Rollenspiel anbieten') AS n_priv \gset
SELECT public.rpc_add_coaching_note(:'e_fa', 'shared', 'Gute Fortschritte bei der Terminquote') AS n_shared \gset

-- employee
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.coaching_sessions)::int, 1, 'employee sees their session');
SELECT is((SELECT count(*) FROM public.coaching_notes)::int, 1, 'employee sees only the shared note');
SELECT is((SELECT visibility FROM public.coaching_notes), 'shared', '…and it is the shared one');
SELECT lives_ok(format($$SELECT public.rpc_set_coaching_action_status(%L, 'done')$$, (SELECT id FROM public.coaching_actions WHERE title LIKE 'Zwei%')),
  'employee completes their own action');
SELECT throws_ok(format($$SELECT public.rpc_set_coaching_action_status(%L, 'done')$$, (SELECT id FROM public.coaching_actions WHERE title LIKE 'Gespräch%')),
  '42501', 'forbidden', 'employee cannot complete the leader''s action');
SELECT throws_ok(format($$SELECT public.rpc_add_coaching_note(%L, 'shared', 'Notiz über mich')$$, :'e_fa'), '42501', 'forbidden', 'employees cannot add notes about themselves');

-- higher manager sees the private note of their report's author
SELECT tests.authenticate_as(:'dl');
SELECT is((SELECT count(*) FROM public.coaching_notes WHERE employee_id = :'e_fa')::int, 2, 'DL (author''s manager) sees both notes');

-- finance, compliance-like roles and admin: nothing
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT is((SELECT count(*) FROM public.coaching_sessions)::int + (SELECT count(*) FROM public.coaching_notes)::int, 0, 'finance sees no coaching (§12.1)');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is((SELECT count(*) FROM public.coaching_notes)::int, 0, 'admins see no coaching notes (least privilege)');
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.coaching_actions)::int, 0, 'peers see nothing');

-- immutability and audit redaction
SELECT tests.clear_authentication();
SELECT throws_ok($$UPDATE public.coaching_notes SET body = 'geändert'$$, '42501', 'append_only', 'notes are append-only');
SELECT is((SELECT new_values ->> 'body' FROM audit.events WHERE entity_type = 'public.coaching_notes' AND entity_id = :'n_priv'),
  '[redacted]', 'private note text is not copied into the audit trail');

-- ---------- performance profile ----------
SELECT tests.authenticate_as(:'tl');
SELECT public.rpc_performance_profile(:'e_fa') AS p \gset
SELECT is(jsonb_array_length(:'p'::jsonb -> 'trend'), 12, '12-month trend');
SELECT is(:'p'::jsonb -> 'employee' ->> 'level', 'FA', 'profile header');
SELECT is(:'p'::jsonb ->> 'next_review_on', '2026-11-01', 'next review date for managers');
SELECT ok(:'p'::jsonb -> 'prompts' @> '[{"code": "overdue_actions", "count": 1}]', 'overdue leader action prompts a follow-up');

SELECT tests.authenticate_as(:'fa');
SELECT lives_ok(format($$SELECT public.rpc_performance_profile(%L)$$, :'e_fa'), 'own profile is visible');
SELECT tests.authenticate_as(:'peer');
SELECT throws_ok(format($$SELECT public.rpc_performance_profile(%L)$$, :'e_fa'), '42501', 'forbidden', 'peers cannot see the profile');
SELECT tests.authenticate_as(:'fin', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_performance_profile(%L)$$, :'e_fa'), '42501', 'forbidden', 'finance cannot see coaching profiles');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT ok((public.rpc_performance_profile(:'e_fa') ->> 'next_review_on') IS NULL, 'admin sees the profile without coaching details');

SELECT * FROM finish();
ROLLBACK;
