-- ============================================================
-- Profina's final rules (migration 20261101170000)
-- Career: personal year then calendar years counted from 1 January,
-- 50 % clause on the strongest structure (points and KV), own-business
-- minimum, retention rate ≥ 90 %.
-- Commission: level on the policy date from the month after a change, own
-- contracts without commission, no clawback after the liability period,
-- statement approval date.
-- Golden IDs are shared with src/domain/career.test.ts.
-- ============================================================
BEGIN;
SELECT plan(36);

-- "eligible|eligible_kv|ready|kv_missing|own_missing|retention ratio"
CREATE FUNCTION pg_temp.rules6(p_threshold numeric, p_kv numeric, p_cap numeric, p_pp numeric, p_pk numeric, p_s jsonb,
                               p_own numeric, p_cancelled numeric, p_ret numeric)
RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', trim_scale((r ->> 'eligible')::numeric), trim_scale((r ->> 'eligible_kv')::numeric),
                   r ->> 'is_ready', trim_scale((r ->> 'kv_missing')::numeric), trim_scale((r ->> 'own_missing')::numeric),
                   coalesce(trim_scale((r -> 'retention' ->> 'ratio')::numeric)::text, '–'))
    FROM (SELECT app_private.apply_career_rules(p_threshold, p_kv, p_cap, p_pp, p_pk, p_s, p_own, p_cancelled, p_ret) AS r) x
$$;

-- ---------- golden: counting start of a period ----------
SELECT is((SELECT string_agg(period_type || ':' || app_private.period_count_from(period_type, start_date), ' ' ORDER BY start_date)
             FROM app_private.period_plan('2026-11-01', '2028-06-01')),
  'first_personal:2026-11-01 transition:2027-01-01 calendar:2028-01-01',
  'GC-PERIOD-006 after the personal year the rest of the year counts from 1 January');

-- ---------- golden: qualification ----------
SELECT is(pg_temp.rules6(750, 0.10, 0.5, 0, 0, '[{"id":"A","points":"500","kv":"0"},{"id":"B","points":"400","kv":"0"}]', NULL, 0, NULL),
  '775|0|false|75|0|1', 'GC-CAREER-008 only the strongest structure is capped (375 + 400)');
SELECT is(pg_temp.rules6(750, 0.10, 0.5, 0, 0, '[{"id":"A","points":"400","kv":"75"},{"id":"B","points":"375","kv":"0"}]', NULL, 0, NULL),
  '750|37.5|false|37.5|0|1', 'GC-CAREER-009 KV from the strongest structure: at most half of the KV requirement');
SELECT is(pg_temp.rules6(100, 0.10, 0.5, 25, 10, '[{"id":"A","points":"50","kv":"0"},{"id":"B","points":"50","kv":"0"}]', 30, 0, 0.9),
  '125|10|false|0|5|1', 'GC-CAREER-010 points reached, but 5 EP own business missing');
SELECT is(pg_temp.rules6(100, 0.10, 0.5, 100, 10, '[]', 30, 12, 0.9),
  '100|10|false|0|0|0.8929', 'GC-CAREER-011 retention rate 100 ÷ 112 = 89,29 % is below 90 %');
SELECT is(pg_temp.rules6(100, 0.10, 0.5, 108, 11, '[]', 30, 12, 0.9),
  '108|11|true|0|0|0.9', 'GC-CAREER-012 retention rate exactly 90 % qualifies');
SELECT is((app_private.apply_career_rules(750, 0.10, 0.5, 0, 0, '[{"id":"A","points":"500","kv":"0"},{"id":"B","points":"400","kv":"0"}]')
            -> 'structures' -> 1 ->> 'cap_applied'), 'false', 'the second structure is never capped');

-- ---------- levels version 2026-11 ----------
SELECT is((SELECT array_agg(coalesce(trim_scale(own_min_points)::text, '–') ORDER BY rank) FROM public.career_levels
            WHERE rule_version_id = app_private.rule_version_at('levels', '2026-11-01')),
  ARRAY['–', '30', '60', '–', '–', '–', '–', '–', '–'], 'own business FB 30 / TL 60 EP');
SELECT is((SELECT count(*) FROM public.career_levels
            WHERE rule_version_id = app_private.rule_version_at('levels', '2026-11-01') AND min_retention_ratio = 0.90)::int, 6,
  'retention rate 90 % for FB … VD');

-- ---------- people ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.grant_role(:'admin', 'finance');
SELECT tests.create_user('tl@test.local', true) AS tl \gset
SELECT tests.create_user('fa@test.local', true) AS fa \gset
SELECT tests.create_user('neu@test.local', true) AS neu \gset
SELECT tests.employee_id(:'tl') AS e_tl, tests.employee_id(:'fa') AS e_fa, tests.employee_id(:'neu') AS e_neu \gset

-- The new employee started on 1 February 2026: personal year until 1 February 2027.
UPDATE public.employees SET start_date = '2026-02-01' WHERE id = :'e_neu';

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_assign_manager(:'e_tl', NULL, '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_assign_manager(:'e_fa', :'e_tl', '2026-01-01', 'Aufbau Teststruktur');
SELECT public.rpc_set_employee_level(:'e_tl', 'TL', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_fa', 'FA', '2026-01-01', 'Einstieg laut Vertrag');
SELECT public.rpc_set_employee_level(:'e_neu', 'FA', '2026-02-01', 'Einstieg laut Vertrag');
-- FA → FB by an admin correction on 15 September: for commission from 1 October.
SELECT public.rpc_set_employee_level(:'e_fa', 'FB', '2026-09-15', 'Beförderung laut Beschluss');

CREATE FUNCTION pg_temp.submitted(p_emp uuid, p_cat text, p_premium numeric, p_period text, p_ng text, p_date date)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := public.rpc_save_production(NULL, p_emp, p_cat, p_premium, p_period, p_ng, NULL, p_date);
  PERFORM public.rpc_submit_production(v);
  RETURN v;
END $$;

-- ---------- commission level on the policy date ----------
SELECT tests.clear_authentication();
SELECT is(app_private.commission_level_at(:'e_fa', '2026-09-30'), 'FA', 'a promotion on 15.09. pays the old rate in September');
SELECT is(app_private.commission_level_at(:'e_fa', '2026-10-01'), 'FB', 'and the new rate from 1 October (Ziff. 6)');
SELECT is(app_private.commission_level_at(:'e_neu', '2026-02-01'), 'FA', 'the initial level counts from its own date');
SELECT is(app_private.level_at(:'e_fa', '2026-09-20'), 'FB', 'the career level itself changes on the day');

SELECT tests.authenticate_as(:'admin', 'aal2');
-- Promoted on 15.09., policy issued on 25.09.: still the FA rate (KV 280 € = 10 EP).
SELECT pg_temp.submitted(:'e_fa', 'KV', 280, 'monthly', NULL, '2026-09-20') AS p_oct \gset
SELECT public.rpc_mark_production_eligible(:'p_oct', '2026-09-25', false);
SELECT tests.clear_authentication();
SELECT is((SELECT recipient_level || ':' || gross_amount FROM public.commission_ledger
            WHERE production_id = :'p_oct' AND relationship = 'self'), 'FA:280.00',
  'policy in September → FA rate 28 € × 10 EP');
SELECT is((SELECT policy_date FROM public.production_records WHERE id = :'p_oct'), '2026-09-25'::date, 'policy date stored');

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_mark_production_eligible(%L, '2026-09-30', false)$$, pg_temp.submitted(:'e_fa', 'KV', 280, 'monthly', NULL, '2026-10-01')),
  'P0001', 'policy_before_production', 'the policy date cannot be before the production date');
SELECT throws_ok(format($$SELECT public.rpc_mark_production_eligible(%L, '2026-11-05', false)$$, pg_temp.submitted(:'e_fa', 'KV', 280, 'monthly', NULL, '2026-10-01')),
  'P0001', 'policy_date_in_future', 'the policy date cannot be in the future');

-- ---------- own contract ----------
SELECT pg_temp.submitted(:'e_fa', 'KV', 280, 'monthly', NULL, '2026-10-05') AS p_own \gset
SELECT public.rpc_mark_production_eligible(:'p_own', '2026-10-06', true);
SELECT tests.clear_authentication();
SELECT is((SELECT points FROM public.point_calculations WHERE production_id = :'p_own'), 10.0000::numeric,
  'an own contract still counts 10 EP for the career');
SELECT is((SELECT count(*) FROM public.commission_ledger WHERE production_id = :'p_own')::int, 0,
  'but books no commission (Eigenvertrag)');
SELECT ok((SELECT own_contract FROM public.production_records WHERE id = :'p_own'), 'own contract flag stored');

-- ---------- cancellation liability ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT pg_temp.submitted(:'e_fa', 'KV', 140, 'monthly', NULL, '2026-03-01') AS p_old \gset
SELECT public.rpc_mark_production_eligible(:'p_old', '2026-03-02', false);
SELECT tests.clear_authentication();
UPDATE public.product_categories SET cancellation_liability_months = 6 WHERE code = 'KV';
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_cancel_production(:'p_old', 'Kündigung nach Ablauf der Haftungszeit');
SELECT tests.clear_authentication();
SELECT is((SELECT status FROM public.production_records WHERE id = :'p_old'), 'cancelled', 'the late cancellation is recorded');
SELECT is((SELECT count(*) FROM public.point_calculations WHERE production_id = :'p_old' AND kind = 'reversal')::int, 0,
  'after the liability period nothing is reversed');
SELECT is((SELECT sum(gross_amount) FROM public.commission_ledger WHERE production_id = :'p_old'), 350.00::numeric,
  'the commission stays earned (FA 140 € + TL differential 210 €)');
UPDATE public.product_categories SET cancellation_liability_months = 60 WHERE code = 'KV';

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_cancel_production(:'p_oct', 'Vertrag vom Kunden widerrufen');
SELECT tests.clear_authentication();
SELECT is((SELECT sum(gross_amount) FROM public.commission_ledger WHERE production_id = :'p_oct'), 0.00::numeric,
  'within the liability period the commission is reversed');

-- ---------- retention rate in the qualification (rules of 2026-11) ----------
SET LOCAL app.business_today = '2026-11-20';
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_generate_all_periods();
SELECT tests.clear_authentication();
SELECT is((app_private.compute_qualification(:'e_fa', '2026-11-20') -> 'retention' ->> 'cancelled')::numeric, 10.0000::numeric,
  'the cancelled 10 EP count as storno');
SELECT is((app_private.compute_qualification(:'e_fa', '2026-11-20') ->> 'target'), 'TL', 'FB aims for TL');
SELECT is((app_private.compute_qualification(:'e_fa', '2026-11-20') ->> 'own_required')::numeric, 60::numeric,
  'TL needs 60 EP own business');

-- ---------- personal year, then the calendar year from 1 January ----------
SET LOCAL app.business_today = '2027-01-10';
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT pg_temp.submitted(:'e_neu', 'KV', 280, 'monthly', NULL, '2026-12-15') AS n_dec \gset
SELECT public.rpc_mark_production_eligible(:'n_dec', '2026-12-16', false);
SELECT pg_temp.submitted(:'e_neu', 'KV', 560, 'monthly', NULL, '2027-01-05') AS n_jan \gset
SELECT public.rpc_mark_production_eligible(:'n_jan', '2027-01-06', false);
SELECT public.rpc_generate_all_periods();
SELECT tests.clear_authentication();
SELECT is((app_private.compute_qualification(:'e_neu', '2027-01-10') ->> 'eligible')::numeric, 30::numeric,
  'in the personal year both count (10 + 20 EP)');
SET LOCAL app.business_today = '2027-03-15';
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_generate_all_periods();
SELECT tests.clear_authentication();
SELECT is((app_private.compute_qualification(:'e_neu', '2027-03-15') -> 'period' ->> 'type'), 'transition',
  'after 1 February 2027 the rest of the calendar year follows');
SELECT is((app_private.compute_qualification(:'e_neu', '2027-03-15') -> 'window' ->> 'start'), '2027-01-01',
  'it counts from 1 January 2027');
SELECT is((app_private.compute_qualification(:'e_neu', '2027-03-15') ->> 'eligible')::numeric, 20::numeric,
  'December 2026 no longer counts, January 2027 does (20 EP)');
RESET app.business_today;

-- ---------- statement approval date ----------
INSERT INTO public.statement_periods (period_month) VALUES ('2026-09-01') ON CONFLICT DO NOTHING;
UPDATE public.statement_periods SET status = 'reviewed' WHERE period_month = '2026-09-01';
SELECT ok((SELECT approved_at IS NULL FROM public.statement_periods WHERE period_month = '2026-09-01'), 'not approved yet');
UPDATE public.statement_periods SET status = 'approved' WHERE period_month = '2026-09-01';
SELECT ok((SELECT approved_at IS NOT NULL FROM public.statement_periods WHERE period_month = '2026-09-01'), 'approval stamps approved_at');
UPDATE public.statement_periods SET status = 'paid' WHERE period_month = '2026-09-01';
SELECT ok((SELECT approved_at IS NOT NULL FROM public.statement_periods WHERE period_month = '2026-09-01'), 'paying keeps it');

-- ---------- rule drafts ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_create_rule_draft('levels', 'Sätze 2027', '2027-01-01') AS draft \gset
SELECT is((SELECT own_min_points FROM public.career_levels WHERE rule_version_id = :'draft' AND code = 'TL'), 60.0000::numeric,
  'a draft copies the own-business minimum');
SELECT public.rpc_update_level_requirements_draft(:'draft', 'TL', 50, 0.85);
SELECT is((SELECT own_min_points || '/' || min_retention_ratio FROM public.career_levels WHERE rule_version_id = :'draft' AND code = 'TL'),
  '50.0000/0.8500', 'and the admin can change it in the draft');

SELECT * FROM finish();
ROLLBACK;
