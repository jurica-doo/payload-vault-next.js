-- ============================================================
-- r1/p1/identity-roles
-- ============================================================
BEGIN;
SELECT plan(49);

-- ---------- fixtures ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('adviser@test.local', true) AS adviser \gset
SELECT tests.create_user('finance@test.local', true) AS finance \gset
SELECT tests.grant_role(:'finance', 'finance');
-- vault-only account, no employee row
SELECT tests.create_user('legacy@test.local') AS legacy \gset

-- ---------- permission gate on admin RPCs ----------
SELECT tests.authenticate_as(:'adviser', 'aal2');
SELECT throws_ok($$SELECT public.rpc_create_employee('A', 'B', 'x@test.local', '2026-11-01')$$,
  '42501', 'forbidden', 'non-admin cannot create employees');
SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok($$SELECT public.rpc_create_employee('A', 'B', 'x@test.local', '2026-11-01')$$,
  '42501', 'mfa_required', 'admin without MFA cannot create employees');
SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT public.rpc_create_employee('A', 'B', 'x@test.local', '2026-11-01')$$,
  '42501', NULL, 'anon cannot call admin RPCs');

-- ---------- create: new person → invited ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_create_employee('  Nora ', 'Neu', '  Nora.Neu@Test.LOCAL ', '2026-11-01', 'part_time', '+491701234567') AS created \gset
SELECT is(:'created'::jsonb ->> 'status', 'invited', 'new employee starts as invited');
SELECT ok((:'created'::jsonb ->> 'needs_invite')::boolean, 'new employee needs an invite');
SELECT matches(:'created'::jsonb ->> 'employee_no', '^P[0-9]{5}$', 'employee number generated');
SELECT is((SELECT email FROM public.employees WHERE id = (:'created'::jsonb ->> 'employee_id')::uuid), 'nora.neu@test.local', 'email trimmed and lowercased');
SELECT is((SELECT first_name FROM public.employees WHERE id = (:'created'::jsonb ->> 'employee_id')::uuid), 'Nora', 'name trimmed');
SELECT is((SELECT count(*) FROM public.employee_invites WHERE email = 'nora.neu@test.local' AND revoked_at IS NULL)::int, 1, 'one open invite');

SELECT throws_ok($$SELECT public.rpc_create_employee('N', 'N', 'NORA.NEU@test.local', '2026-11-01')$$,
  '23505', 'employee_exists', 'duplicate email (other case) rejected');
SELECT throws_ok($$SELECT public.rpc_create_employee('N', 'N', 'not-an-email', '2026-11-01')$$,
  '23514', NULL, 'malformed email rejected');
SELECT throws_ok($$SELECT public.rpc_create_employee('N', 'N', 'p@test.local', '2026-11-01', 'full_time', '0170 123')$$,
  '23514', NULL, 'phone must be E.164');
SELECT throws_ok($$SELECT public.rpc_create_employee('N', 'N', 'q@test.local', '2026-11-01', 'freelance')$$,
  '23514', NULL, 'unknown employment type rejected');
SELECT throws_ok($$SELECT public.rpc_create_employee('  ', 'N', 'r@test.local', '2026-11-01')$$,
  '23514', NULL, 'blank first name rejected');

-- ---------- create: existing vault account → linked + active ----------
SELECT public.rpc_create_employee('Lea', 'Legacy', 'LEGACY@test.local', '2025-01-01') AS linked \gset
SELECT is(:'linked'::jsonb ->> 'status', 'active', 'existing account is linked as active');
SELECT ok(NOT (:'linked'::jsonb ->> 'needs_invite')::boolean, 'existing account needs no invite');
SELECT is((SELECT user_id FROM public.employees WHERE email = 'legacy@test.local'), :'legacy'::uuid, 'linked to the existing auth user');
SELECT tests.clear_authentication();

-- ---------- signup gate, link, activation ----------
SELECT lives_ok(
  $$INSERT INTO auth.users (id, instance_id, aud, role, email)
    VALUES ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Nora.Neu@test.local')$$,
  'invited email passes the gate (case-insensitive)');
SELECT is((SELECT user_id FROM public.employees WHERE email = 'nora.neu@test.local'), '00000000-0000-0000-0000-00000000aaaa'::uuid, 'auth user linked to employee');
SELECT is((SELECT status FROM public.employees WHERE email = 'nora.neu@test.local'), 'invited', 'still invited before the link is used');
UPDATE auth.users SET email_confirmed_at = now() WHERE id = '00000000-0000-0000-0000-00000000aaaa';
SELECT is((SELECT status FROM public.employees WHERE email = 'nora.neu@test.local'), 'active', 'active after email confirmation');
SELECT ok((SELECT accepted_at IS NOT NULL FROM public.employee_invites WHERE email = 'nora.neu@test.local' AND revoked_at IS NULL), 'invite marked accepted');

-- expired and revoked invites don't open the gate
INSERT INTO public.employees (first_name, last_name, email, start_date) VALUES ('E', 'X', 'expired@test.local', '2026-01-01');
INSERT INTO public.employee_invites (employee_id, email, created_at, expires_at)
SELECT id, email, now() - interval '8 days', now() - interval '1 day' FROM public.employees WHERE email = 'expired@test.local';
SELECT throws_ok(
  $$INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'expired@test.local')$$,
  '23514', NULL, 'expired invite is rejected');

-- ---------- issue / revoke invites ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_issue_invite(%L)', tests.employee_id(:'legacy')), 'P0001', 'already_linked', 'no invite for a linked employee');
SELECT public.rpc_issue_invite(id) FROM public.employees WHERE email = 'expired@test.local';
SELECT is((SELECT count(*) FROM public.employee_invites WHERE email = 'expired@test.local' AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now())::int,
  1, 're-issue leaves exactly one valid invite');
SELECT tests.clear_authentication();
SELECT ok((SELECT count(*) FROM audit.events WHERE action = 'employee.invite_issued') >= 1, 'invite issue is audited');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_revoke_invite(%L, %L)', (SELECT id FROM public.employees WHERE email = 'expired@test.local'), 'kurz'),
  '22023', 'reason_required', 'revoking needs a reason');

-- ---------- deactivate / reactivate ----------
SELECT throws_ok(format('SELECT public.rpc_set_employee_active(%L, false, %L)', tests.employee_id(:'admin'), 'Ich verlasse das Unternehmen'),
  'P0001', 'cannot_deactivate_self', 'admin cannot deactivate themselves');
SELECT is(public.rpc_set_employee_active(tests.employee_id(:'adviser'), false, 'Vertrag beendet zum Monatsende'), 'inactive', 'deactivated');
SELECT ok((SELECT deactivated_at IS NOT NULL FROM public.employees WHERE user_id = :'adviser'), 'deactivation date set');

SELECT tests.authenticate_as(:'adviser');
SELECT is(public.rpc_my_context() -> 'employee' ->> 'status', 'inactive', 'inactive employee sees their status in the context');
SELECT is((SELECT count(*) FROM public.employees)::int, 0, 'inactive employee loses access to employee data');

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is(public.rpc_set_employee_active(tests.employee_id(:'adviser'), true, 'Rückkehr nach Elternzeit'), 'active', 'reactivated');

-- ---------- RLS ----------
SELECT tests.authenticate_as(:'adviser');
SELECT is((SELECT count(*) FROM public.employees)::int, 1, 'adviser sees only their own employee row');
SELECT is((SELECT count(*) FROM public.employee_invites)::int, 0, 'adviser sees no invites');
SELECT is((SELECT count(*) FROM public.user_roles)::int, 0, 'adviser sees no roles (has none)');
SELECT throws_ok($$INSERT INTO public.employees (first_name, last_name, email, start_date) VALUES ('X', 'Y', 'z@test.local', '2026-01-01')$$,
  '42501', NULL, 'no direct inserts');
SELECT throws_ok($$UPDATE public.employees SET first_name = 'Hack'$$, '42501', NULL, 'no direct updates');

SELECT tests.authenticate_as(:'finance');
SELECT ok((SELECT count(*) FROM public.employees) >= 4, 'finance sees all employees');
SELECT is((SELECT count(*) FROM public.user_roles)::int, 1, 'finance sees only their own role rows');

-- ---------- roles ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format('SELECT public.rpc_revoke_role(%L, %L, %L)', :'admin', 'admin', 'Rolle nicht mehr benötigt'),
  'P0001', 'last_admin', 'the last admin cannot be removed');
SELECT public.rpc_grant_role(:'adviser', 'compliance', 'Datenschutzbeauftragte ab November');
SELECT public.rpc_grant_role(:'adviser', 'compliance', 'Doppelte Vergabe ist ein No-op');
SELECT is((SELECT count(*) FROM public.user_roles WHERE user_id = :'adviser' AND revoked_at IS NULL)::int, 1, 'granting twice is idempotent');

SELECT tests.authenticate_as(:'adviser');
SELECT is(public.rpc_my_context() -> 'roles', '["compliance"]'::jsonb, 'context lists granted roles');
SELECT is(public.rpc_my_context() -> 'employee' ->> 'status', 'active', 'context includes the employee');

-- ---------- audit read access ----------
SELECT ok((SELECT count(*) FROM public.rpc_audit_for('public.employees', tests.employee_id(:'adviser')::text)) >= 2,
  'employee can read their own record history (compliance role here)');
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.authenticate_as(:'peer');
SELECT throws_ok(format('SELECT * FROM public.rpc_audit_for(%L, %L)', 'public.employees', tests.employee_id(:'adviser')),
  '42501', 'forbidden', 'peer cannot read another employee''s history');
SELECT ok((SELECT count(*) FROM public.rpc_audit_for('public.employees', tests.employee_id(:'peer')::text)) >= 1,
  'peer can read their own history');

-- ---------- bootstrap ----------
SELECT tests.clear_authentication();
SELECT throws_ok($$SELECT app_private.bootstrap_admin('adviser@test.local')$$, 'P0001', 'admin_exists', 'bootstrap refuses once an admin exists');
SELECT ok(NOT has_function_privilege('authenticated', 'app_private.bootstrap_admin(text)', 'EXECUTE'), 'bootstrap not executable by authenticated');

SELECT * FROM finish();
ROLLBACK;
