-- ============================================================
-- Baseline security (pre-requirements1 schema)
-- ============================================================
-- Pins down what check.md verified by hand on production on 2026-10-26, so a
-- future migration can't quietly undo it:
--   * vault tables are private to their owner (D1 in IMPLEMENTATION_PLAN.md)
--   * anon has no table privileges
--   * function EXECUTE rights
--   * signup allowlist trigger rejects uninvited addresses
--   * consume_rate_limit allows `limit` calls per window, then refuses
-- ============================================================
BEGIN;
SELECT plan(24);

-- ---------- fixtures (as postgres) ----------
SELECT tests.create_user('owner@test.local') AS owner \gset
SELECT tests.create_user('peer@test.local') AS peer \gset

INSERT INTO public.expenses (user_id, category, expense_date, amount, file_name, image_url)
VALUES (:'owner', 'Mobilität', '2026-10-01', 12.50, 'a.jpg', 'owner/a.jpg');
INSERT INTO public.pdf_records (user_id, category, date_created, file_name, pdf_url)
VALUES (:'owner', 'IKK Abrechnung', '2026-10-01', 'a.pdf', 'owner/a.pdf');
INSERT INTO public.budget_targets (user_id, year, category, budget_amount)
VALUES (:'owner', 2026, 'Mobilität', 100);
INSERT INTO public.income_goals (user_id, year, month, goal_amount)
VALUES (:'owner', 2026, 10, 1000);

-- ---------- RLS: rows are private to their owner ----------
SELECT tests.authenticate_as(:'owner');
SELECT is((SELECT count(*) FROM public.expenses)::int, 1, 'owner sees own expense');
SELECT is((SELECT count(*) FROM public.pdf_records)::int, 1, 'owner sees own pdf record');
SELECT is((SELECT count(*) FROM public.budget_targets)::int, 1, 'owner sees own budget target');
SELECT is((SELECT count(*) FROM public.income_goals)::int, 1, 'owner sees own income goal');

SELECT tests.authenticate_as(:'peer');
SELECT is((SELECT count(*) FROM public.expenses)::int, 0, 'peer cannot see owner expense');
SELECT is((SELECT count(*) FROM public.pdf_records)::int, 0, 'peer cannot see owner pdf record');
SELECT is((SELECT count(*) FROM public.budget_targets)::int, 0, 'peer cannot see owner budget target');
SELECT is((SELECT count(*) FROM public.income_goals)::int, 0, 'peer cannot see owner income goal');

SELECT throws_ok(
  format($$INSERT INTO public.expenses (user_id, category, expense_date, amount, file_name, image_url)
           VALUES (%L, 'Mobilität', '2026-10-02', 1, 'x.jpg', 'x.jpg')$$, :'owner'),
  '42501', NULL, 'peer cannot insert a row owned by someone else');

UPDATE public.expenses SET amount = 999 WHERE user_id = :'owner';
DELETE FROM public.pdf_records WHERE user_id = :'owner';
SELECT tests.clear_authentication();
SELECT is((SELECT amount FROM public.expenses WHERE user_id = :'owner'), 12.50::numeric, 'peer update affected nothing');
SELECT is((SELECT count(*) FROM public.pdf_records WHERE user_id = :'owner')::int, 1, 'peer delete affected nothing');

-- ---------- anon ----------
SELECT tests.authenticate_as_anon();
SELECT throws_ok('SELECT 1 FROM public.expenses LIMIT 1', '42501', NULL, 'anon has no SELECT on expenses');
SELECT throws_ok('SELECT 1 FROM public.signup_allowlist LIMIT 1', '42501', NULL, 'anon has no SELECT on signup_allowlist');
SELECT tests.clear_authentication();

SELECT is(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'PUBLIC'))::int,
  0, 'no table privileges for anon or PUBLIC in public schema');

SELECT is(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'authenticated'
      AND table_name IN ('signup_allowlist', 'edge_rate_limits'))::int,
  0, 'authenticated has no privileges on signup_allowlist / edge_rate_limits');

-- ---------- function EXECUTE rights ----------
SELECT ok(NOT has_function_privilege('anon', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'), 'anon cannot run consume_rate_limit');
SELECT ok(NOT has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'), 'authenticated cannot run consume_rate_limit');
SELECT ok(has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'), 'service_role can run consume_rate_limit');
SELECT ok(NOT has_function_privilege('anon', 'public.get_user_report_years()', 'EXECUTE'), 'anon cannot run get_user_report_years');
SELECT ok(has_function_privilege('authenticated', 'public.get_user_report_years()', 'EXECUTE'), 'authenticated can run get_user_report_years');

-- ---------- signup allowlist ----------
SELECT throws_ok(
  $$INSERT INTO auth.users (id, instance_id, aud, role, email)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test.local')$$,
  NULL, NULL, 'uninvited email is rejected by the allowlist trigger');

SELECT lives_ok(
  $$INSERT INTO public.signup_allowlist (email) VALUES ('invited@test.local');
    INSERT INTO auth.users (id, instance_id, aud, role, email)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Invited@Test.local')$$,
  'allowlisted email is accepted regardless of case');

-- ---------- rate limiter ----------
SELECT tests.authenticate_as_service_role();
SELECT is(
  (SELECT string_agg(CASE WHEN public.consume_rate_limit('test:key', 10, 60) THEN 'T' ELSE 'F' END, '')
     FROM generate_series(1, 11)),
  'TTTTTTTTTTF', 'consume_rate_limit allows 10 calls then refuses the 11th');
SELECT ok(NOT public.consume_rate_limit('', 10, 60), 'empty key fails closed');

SELECT * FROM finish();
ROLLBACK;
