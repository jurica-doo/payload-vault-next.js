-- ============================================================
-- r1/p5/service-reminders
-- ============================================================
BEGIN;
SELECT plan(19);

-- next_anniversary (shared rule with src/domain/serviceDates.ts)
SELECT is(app_private.next_anniversary('2020-03-15', '2026-10-28'), '2027-03-15'::date, 'GC-SERVICE-001 next anniversary after today');
SELECT is(app_private.next_anniversary('2024-02-29', '2026-10-28'), '2027-02-28'::date, 'GC-SERVICE-002 29 Feb → 28 Feb in a common year');
SELECT is(app_private.next_anniversary('2026-11-05', '2026-10-28'), '2026-11-05'::date, 'GC-SERVICE-003 a future date is its own anniversary');
SELECT is(app_private.next_anniversary('2025-10-28', '2026-10-28'), '2026-10-28'::date, 'GC-SERVICE-004 today counts');

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('peer@test.local', true) AS peer \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'peer') AS e_peer \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT app_private.business_today() AS today \gset

SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_create_customer('{"last_name": "Service"}') AS c1 \gset
SELECT public.rpc_save_contract_link(NULL, :'c1', '{"external_contract_id": "U-1"}') AS k_nodate \gset
SELECT public.rpc_save_contract_link(NULL, :'c1', jsonb_build_object('external_contract_id', 'U-2', 'renewal_date', (:'today'::date + 5)::text), true) AS k_date \gset

-- ---------- items ----------
SELECT throws_ok(format($$SELECT public.rpc_save_service_item(NULL, %L, 'contract_renewal', 'Hauptfälligkeit', NULL, NULL, 'yearly', %L)$$, :'c1', :'k_nodate'),
  'P0001', 'renewal_date_unconfirmed', 'no renewal reminder without a confirmed date (§10.3)');
SELECT public.rpc_save_service_item(NULL, :'c1', 'contract_renewal', 'Hauptfälligkeit prüfen', '2000-01-01', NULL, 'yearly', :'k_date') AS i_renew \gset
SELECT is((SELECT due_on FROM public.customer_service_items WHERE id = :'i_renew'), (:'today'::date + 5),
  'renewal due date comes from the contract, not from the form');
SELECT public.rpc_save_service_item(NULL, :'c1', 'annual_review', 'Jahresgespräch', (:'today'::date + 60), NULL, 'yearly') AS i_review \gset
SELECT public.rpc_save_service_item(NULL, :'c1', 'pending_documents', 'Gesundheitsfragen nachreichen', (:'today'::date - 2)) AS i_docs \gset
SELECT throws_ok(format($$SELECT public.rpc_save_service_item(NULL, %L, 'other', 'Für Kollegen', %L, %L)$$, :'c1', :'today', :'e_peer'),
  '42501', 'forbidden', 'owner must be in the own structure');
SELECT throws_ok(format($$SELECT public.rpc_save_service_item(NULL, %L, 'other', 'Ohne Datum', NULL)$$, :'c1'), '22023', 'date_required', 'needs a date');

-- ---------- tasks ----------
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'customer_service' AND status = 'open' AND linked_id = :'c1')::int, 1,
  'one task per customer, however many items are due');
SELECT is((SELECT priority FROM public.tasks WHERE type = 'customer_service' AND status = 'open'), 'high', 'overdue item → high priority');
SELECT ok((SELECT title LIKE '2 Serviceanlässe%' FROM public.tasks WHERE type = 'customer_service' AND status = 'open'),
  'two items within the lead time (the review in 60 days is not)');

-- ---------- completing ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_set_service_item_status(:'i_docs', 'done', 'Unterlagen eingegangen');
SELECT public.rpc_set_service_item_status(:'i_renew', 'done') AS i_next \gset
SELECT is((SELECT due_on FROM public.customer_service_items WHERE id = :'i_next'), ((:'today'::date + 5) + interval '1 year')::date,
  'yearly renewal → next year''s item from the contract date');
SELECT is((SELECT previous_id FROM public.customer_service_items WHERE id = :'i_next'), :'i_renew'::uuid, 'chain of occurrences kept');
SELECT throws_ok(format($$SELECT public.rpc_set_service_item_status(%L, 'done')$$, :'i_docs'), 'P0001', 'invalid_status', 'cannot complete twice');
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'customer_service' AND status = 'open')::int, 0, 'task closes when nothing is due');

-- ---------- follow-ups are separate ----------
SELECT tests.authenticate_as(:'fa');
SELECT public.rpc_update_customer(:'c1', jsonb_build_object('next_follow_up_at', now() + interval '2 hours'));
SELECT tests.clear_authentication();
SELECT app_private.run_task_generators();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'customer_follow_up' AND status = 'open')::int, 1, 'follow-up has its own task type');

-- ---------- visibility ----------
SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.customer_service_items)::int, 0, 'peers see no service items');
SELECT throws_ok(format($$SELECT public.rpc_set_service_item_status(%L, 'cancelled')$$, :'i_review'), '42501', 'forbidden', '…and cannot close them');
SELECT tests.authenticate_as(:'tl');
SELECT is((SELECT count(*) FROM public.customer_service_items WHERE customer_id = :'c1')::int, 4, 'manager sees them');

SELECT * FROM finish();
ROLLBACK;
