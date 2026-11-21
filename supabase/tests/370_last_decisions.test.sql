-- ============================================================
-- Profina's last decisions (migration 20261101220000): Kfz off,
-- Rechtsschutz with commission, confirmation year with 80 %
-- Golden IDs shared with src/domain/confirmation.test.ts.
-- ============================================================
BEGIN;
SELECT plan(26);

-- ---------- confirmation rules (golden) ----------
SELECT is(app_private.confirmation_window('2026-11-15'), daterange('2026-12-01', '2027-12-01', '[)'), 'GC-CONFIRM-001 window after 15.11.2026');
SELECT is(app_private.confirmation_window('2026-12-31'), daterange('2027-01-01', '2028-01-01', '[)'), 'GC-CONFIRM-002 across the year end');
SELECT is(app_private.confirmation_window('2026-12-01'), daterange('2027-01-01', '2028-01-01', '[)'), 'GC-CONFIRM-003 promotion on the 1st');
SELECT is(round(300 * app_private.confirmation_ratio(), 4), 240.0000::numeric, 'GC-CONFIRM-004 80 % of 300');
SELECT is(app_private.confirmation_state(240, 239.99, '2027-11-30', daterange('2026-12-01', '2027-12-01', '[)')), 'running', 'GC-CONFIRM-005 still running');
SELECT is(app_private.confirmation_state(240, 239.99, '2027-12-01', daterange('2026-12-01', '2027-12-01', '[)')), 'missed', 'GC-CONFIRM-006 missed after the year');
SELECT is(app_private.confirmation_state(240, 240, '2027-03-01', daterange('2026-12-01', '2027-12-01', '[)')), 'met', 'GC-CONFIRM-007 met early');
SELECT is(app_private.confirmation_state(240, 0, '2026-11-20', daterange('2026-12-01', '2027-12-01', '[)')), 'pending', 'GC-CONFIRM-008 not started yet');
SELECT is(app_private.confirmation_state(240, 100, '2027-12-05', daterange('2026-12-01', '2027-12-01', '[)'), 'kept'), 'kept', 'GC-CONFIRM-009 decision wins');

-- ---------- Kfz / Rechtsschutz ----------
SELECT is(app_private.calculate_points('KFZ', 1000, 'annual', 'net', 'EUR', NULL, '2026-11-15') ->> 'points', '0.0000', 'Kfz: no career points');
SELECT is(app_private.calculate_points('RS', 500, 'annual', 'net', 'EUR', NULL, '2026-11-15') -> 'details' ->> 'pays_commission', 'true',
  'Rechtsschutz pays commission per point');
SELECT throws_ok($$INSERT INTO public.conversion_rules (rule_version_id, category_code, formula_kind, divisor, pays_commission, counts_for_career)
                   VALUES (gen_random_uuid(), 'KFZ', 'sach_annual_net', 1, true, false)$$, '23514', NULL,
  'commission per point needs career points');

-- ---------- confirmation year end to end ----------
SET LOCAL app.business_today = '2026-11-20';
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.create_user('vdp@test.local', true) AS vdp \gset
SELECT tests.employee_id(:'fb') AS e_fb, tests.employee_id(:'vdp') AS e_vdp, tests.employee_id(:'admin') AS e_admin \gset
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_set_employee_level(:'e_fb', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_vdp', 'VD', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_admin', 'VD', '2026-01-01', 'Einstieg laut Vertrag');
SELECT tests.clear_authentication();

-- A promotion to FB on 2026-11-05 (threshold 100 → 80 needed by 30.11.2027).
INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason)
VALUES (:'e_fb', 'FB', '2026-11-05', 'promotion', 'Test: Beförderung');
INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason)
VALUES (:'e_vdp', 'VDP', '2026-11-05', 'promotion', 'Test: Ernennung');

SELECT is(app_private.confirmation_status(:'e_fb', '2026-11-20') ->> 'status', 'pending', 'before December: not started');
SELECT is((app_private.confirmation_status(:'e_fb', '2026-11-20') ->> 'required')::numeric, 80.0000::numeric, '80 % of FB 100');
SELECT is(app_private.confirmation_status(:'e_fb', '2026-11-20') ->> 'previous_level', 'FA', 'the level before the promotion');
SELECT is(app_private.confirmation_status(:'e_vdp', '2026-11-20'), NULL, 'no confirmation year for VD+ / GM');

-- Production in the year: 25 KV points (700 € KV) counts, Kfz does not.
SET LOCAL app.business_today = '2027-06-01';
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_save_production(NULL, :'e_fb', 'KV', 700, 'monthly', NULL, NULL, '2027-01-10') AS p1 \gset
SELECT public.rpc_submit_production(:'p1');
SELECT public.rpc_mark_production_eligible(:'p1');
SELECT public.rpc_save_production(NULL, :'e_fb', 'KFZ', 5000, 'annual', 'net', NULL, '2027-01-10') AS p2 \gset
SELECT public.rpc_submit_production(:'p2');
SELECT public.rpc_mark_production_eligible(:'p2');
SELECT tests.clear_authentication();
SELECT is((app_private.confirmation_status(:'e_fb', '2027-06-01') ->> 'achieved')::numeric, 25.0000::numeric, 'KV counts, Kfz adds nothing');
SELECT is(app_private.confirmation_status(:'e_fb', '2027-06-01') ->> 'status', 'running', 'running in June 2027');

-- The year ends: missed → review task for the admin, decision.
SET LOCAL app.business_today = '2027-12-02';
SELECT is(app_private.confirmation_status(:'e_fb', '2027-12-02') ->> 'status', 'missed', '25 of 80 → missed');
SELECT app_private.run_confirmation_review_tasks();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'confirmation_review' AND owner_id = :'e_admin' AND status = 'open')::int, 1,
  'the admin gets a review task');

SELECT tests.authenticate_as(:'fb');
SELECT throws_ok(format($$SELECT public.rpc_decide_confirmation(%L, true, 'Ziel nicht erreicht, Rückstufung')$$, :'e_fb'), '42501', NULL,
  'only admins decide');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT is(public.rpc_decide_confirmation(:'e_fb', true, 'Ziel nicht erreicht, Rückstufung'), 'demoted', 'the management demotes');
SELECT tests.clear_authentication();
SELECT is(app_private.level_at(:'e_fb', '2027-12-02'), 'FA', 'back to FA from today');
SELECT is(app_private.commission_level_at(:'e_fb', '2027-12-15'), 'FB', 'commission keeps the FB rate this month');
SELECT is(app_private.confirmation_status(:'e_fb', '2027-12-02') ->> 'status', 'demoted', 'the decision stays visible');
SELECT app_private.run_confirmation_review_tasks();
SELECT is((SELECT count(*) FROM public.tasks WHERE type = 'confirmation_review' AND status = 'open')::int, 0, 'the task closes itself');

SELECT * FROM finish();
ROLLBACK;
