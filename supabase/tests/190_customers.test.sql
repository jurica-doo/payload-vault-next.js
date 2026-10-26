-- ============================================================
-- r1/p5/customers
-- ============================================================
BEGIN;
SELECT plan(29);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('fin@test.local', true) AS fin \gset
SELECT tests.grant_role(:'fin', 'finance');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('fa2@test.local', true) AS fa2 \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'fa2') AS e_fa2,
       tests.employee_id(:'peer') AS e_peer \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa2', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT id AS src FROM public.lead_sources WHERE name = 'Empfehlung' \gset

-- ---------- create ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer(jsonb_build_object('first_name', 'Erika', 'last_name', 'Musterfrau', 'phone', '+491701112223',
  'email', 'Erika@Example.org', 'date_of_birth', '1980-05-17', 'postal_code', '80331', 'city', 'München')) AS c1 \gset
SELECT is((SELECT owner_id FROM public.customers WHERE id = :'c1'), :'e_fa'::uuid, 'adviser owns own customer');
SELECT is((SELECT email FROM public.customers WHERE id = :'c1'), 'erika@example.org', 'email lowercased');
SELECT is((SELECT count(*) FROM public.customer_assignments WHERE customer_id = :'c1')::int, 1, 'creation recorded in the adviser history');
SELECT throws_ok($$SELECT public.rpc_create_customer('{"last_name": "Anders", "phone": "+491701112223"}')$$, 'P0001', 'possible_duplicate',
  'same phone → duplicate warning');
SELECT throws_ok($$SELECT public.rpc_create_customer('{"first_name": "Ohne"}')$$, '22023', 'customer_name_required', 'needs a last name or company');
SELECT throws_ok($$SELECT public.rpc_create_customer('{"last_name": "Zukunft", "date_of_birth": "2999-01-01"}')$$, '22023', 'invalid_date_of_birth',
  'birth date cannot be in the future');
SELECT throws_ok($$SELECT public.rpc_create_customer('{"last_name": "X", "iban": "DE00"}')$$, '22023', 'invalid_input', 'unknown fields are rejected');
SELECT throws_ok(format($$SELECT public.rpc_create_customer('{"last_name": "Chefkunde"}', %L)$$, :'e_tl'), '42501', 'forbidden',
  'cannot create customers for a manager');
SELECT public.rpc_update_customer(:'c1', '{"preferred_name": "Eri", "status": "active"}');
SELECT is((SELECT preferred_name FROM public.customers WHERE id = :'c1'), 'Eri', 'adviser edits own customer');

-- ---------- visibility ----------
SELECT tests.authenticate_as(:'tl');
SELECT is((SELECT count(*) FROM public.customers WHERE id = :'c1')::int, 1, 'manager sees the structure''s customers');
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.customers)::int, 0, 'peers see no customers');
SELECT throws_ok(format($$SELECT public.rpc_update_customer(%L, '{"notes": "x"}')$$, :'c1'), '42501', 'forbidden', 'peers cannot edit');
SELECT is((public.rpc_find_customer_duplicates(NULL, 'Musterfrau', NULL, '+491701112223', NULL) -> 0 ->> 'visible')::boolean, false,
  'duplicates of other advisers are reported without details');
SELECT tests.authenticate_as(:'fin');
SELECT is((SELECT count(*) FROM public.customers)::int, 0, 'finance has no customer access');
SELECT tests.authenticate_as(:'comp');
SELECT is((SELECT count(*) FROM public.customers)::int, 1, 'compliance can read customers');
SELECT throws_ok(format($$SELECT public.rpc_update_customer(%L, '{"notes": "x"}')$$, :'c1'), '42501', 'forbidden', '…but not change them');
SELECT tests.clear_authentication();
SELECT ok((SELECT bool_and(new_values ->> 'phone' IS DISTINCT FROM '+491701112223') FROM audit.events WHERE entity_type = 'public.customers'),
  'phone is redacted in the audit log');

-- ---------- reassignment and archive ----------
SELECT tests.authenticate_as(:'tl');
SELECT throws_ok(format($$SELECT public.rpc_assign_customer(%L, %L, 'kurz')$$, :'c1', :'e_fa2'), '22023', 'reason_required', 'reassignment needs a reason');
SELECT throws_ok(format($$SELECT public.rpc_assign_customer(%L, %L, 'Kollege aus anderem Team')$$, :'c1', :'e_peer'), '42501', 'forbidden',
  'only within the own structure');
SELECT public.rpc_assign_customer(:'c1', :'e_fa2', 'Beraterin wechselt in den Innendienst');
SELECT tests.authenticate_as(:'fa');
SELECT is((SELECT count(*) FROM public.customers WHERE id = :'c1')::int, 0, 'previous adviser loses access');
SELECT tests.authenticate_as(:'fa2');
SELECT ok(EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'customer_assigned'), 'new adviser is notified');
SELECT throws_ok(format($$SELECT public.rpc_archive_customer(%L, true, 'x')$$, :'c1'), '22023', 'reason_required', 'archiving needs a reason');
SELECT public.rpc_archive_customer(:'c1', true, 'Kunde hat alle Verträge gekündigt');
SELECT ok((SELECT archived_at IS NOT NULL FROM public.customers WHERE id = :'c1'), 'archived, not deleted');

-- ---------- activities ----------
SELECT public.rpc_archive_customer(:'c1', false, 'Kunde ist doch wieder aktiv');
SELECT lives_ok(format($$SELECT public.rpc_log_activity('call', 'customer', %L, NULL, NULL, 'reached')$$, :'c1'), 'activities link to customers');
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok(format($$SELECT public.rpc_log_activity('call', 'customer', %L)$$, :'c1'), '42501', 'forbidden', '…only for people who may work on them');

-- ---------- lead conversion ----------
SELECT public.rpc_create_lead(jsonb_build_object('first_name', 'Hans', 'last_name', 'Neukunde', 'email', 'hans@example.org', 'source_id', :'src')) AS l1 \gset
SELECT public.rpc_convert_lead(:'l1') AS c2 \gset
SELECT is((SELECT customer_id FROM public.leads WHERE id = :'l1'), :'c2'::uuid, 'lead points to the customer');
SELECT ok((SELECT lead_id = :'l1' AND email = 'hans@example.org' AND owner_id = :'e_fa' FROM public.customers WHERE id = :'c2'),
  'customer keeps identity, adviser and the lead link (and so the source)');
SELECT is((SELECT stage FROM public.leads WHERE id = :'l1'), 'won', 'open lead is closed as won');
SELECT throws_ok(format($$SELECT public.rpc_convert_lead(%L)$$, :'l1'), 'P0001', 'already_converted', 'converted only once');

SELECT * FROM finish();
ROLLBACK;
