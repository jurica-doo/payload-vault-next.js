-- ============================================================
-- r1/p1/rules-config
-- ============================================================
BEGIN;
SELECT plan(46);

SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fb@test.local', true) AS fb \gset
SELECT tests.employee_id(:'fb') AS e_fb \gset

SELECT app_private.rule_version_at('levels', '2026-06-01') AS v_levels,
       app_private.rule_version_at('conversion', '2026-06-01') AS v_conv \gset

-- ---------- seeds match the spec ----------
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(code, point_rate, max_subsidy, threshold_points) ORDER BY rank)
     FROM public.career_levels WHERE rule_version_id = :'v_levels'),
  '[["FA",28.00,null,0.0000],["FB",56.00,500.00,100.0000],["TL",70.00,1000.00,300.0000],["OL",92.00,1500.00,750.0000],["DL",112.00,2500.00,1500.0000],["RL",132.00,3500.00,4000.0000],["VD",144.00,6000.00,9000.0000]]'::jsonb,
  'levels, rates, max subsidies and thresholds match spec §2');

-- §4.4 / §17.2: KV minimum = 10 % of the target threshold; AE = points × 28
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(code, threshold_points * kv_min_ratio, threshold_points * 28) ORDER BY rank)
     FROM public.career_levels WHERE rule_version_id = :'v_levels' AND rank > 1),
  '[["FB",10.000000,2800.0000],["TL",30.000000,8400.0000],["OL",75.000000,21000.0000],["DL",150.000000,42000.0000],["RL",400.000000,112000.0000],["VD",900.000000,252000.0000]]'::jsonb,
  'KV minimums and AE equivalents match spec §4.4 / §17.2');

SELECT is(
  (SELECT array_agg(code ORDER BY rank) FROM public.career_levels WHERE rule_version_id = :'v_levels' AND structure_cap_ratio = 0.5),
  ARRAY['OL', 'DL', 'RL', 'VD'], '50 % structure cap on target levels OL and above (OD-04)');

SELECT is(
  (SELECT jsonb_object_agg(category_code, jsonb_build_array(formula_kind, divisor, max_term_years, required_premium_period, required_net_gross))
     FROM public.conversion_rules WHERE rule_version_id = :'v_conv'),
  '{"LV": ["lv_monthly_term", 4000.0000, 35, "monthly", null],
    "KV": ["kv_monthly", 28.0000, null, "monthly", null],
    "SACH": ["sach_annual_net", 200.0000, null, "annual", "net"],
    "KFZ": ["none", null, null, null, null],
    "STROM": ["none", null, null, null, null],
    "GAS": ["none", null, null, null, null]}'::jsonb,
  'conversion rules match spec §3');
SELECT is((SELECT ae_per_point FROM public.rule_versions WHERE id = :'v_conv'), 28.0000::numeric, '1 point = 28 AE');
SELECT is((SELECT array_agg(code) FROM public.product_categories WHERE is_kv), ARRAY['KV'], 'only KV is tagged as KV');

-- ---------- version lookup ----------
SELECT is(app_private.rule_version_at('levels', '2025-12-31'), NULL, 'no version before the first effective date');
SELECT is(app_private.rule_version_at('levels', '2026-01-01'), :'v_levels'::uuid, 'version valid from its effective date');

-- ---------- immutability (even for postgres) ----------
SELECT throws_ok(format($$UPDATE public.career_levels SET point_rate = 30 WHERE rule_version_id = %L AND code = 'FA'$$, :'v_levels'),
  'P0001', 'rule_version_immutable', 'published level rows cannot change');
SELECT throws_ok(format($$DELETE FROM public.conversion_rules WHERE rule_version_id = %L$$, :'v_conv'),
  'P0001', 'rule_version_immutable', 'published conversion rows cannot be deleted');
SELECT throws_ok(format($$INSERT INTO public.conversion_rules (rule_version_id, category_code, formula_kind) VALUES (%L, 'KFZ', 'none')$$, :'v_conv'),
  'P0001', 'rule_version_immutable', 'no rows can be added to a published version');
SELECT throws_ok(format($$UPDATE public.rule_versions SET label = 'x' WHERE id = %L$$, :'v_levels'),
  'P0001', 'rule_version_immutable', 'published version itself is immutable');
SELECT throws_ok(format($$DELETE FROM public.rule_versions WHERE id = %L$$, :'v_levels'),
  'P0001', 'rule_version_immutable', 'published version cannot be deleted');
SELECT throws_ok($$INSERT INTO public.conversion_rules (rule_version_id, category_code, formula_kind, divisor) VALUES (gen_random_uuid(), 'KFZ', 'none', 5)$$,
  '23514', NULL, 'formula "none" cannot have a divisor');

-- ---------- reading ----------
SELECT tests.authenticate_as(:'fb');
SELECT is(jsonb_array_length(public.rpc_rules_at('2026-06-01') -> 'levels' -> 'rows'), 7, 'rpc_rules_at returns 7 levels');
SELECT is(public.rpc_rules_at('2026-06-01') -> 'conversion' ->> 'ae_per_point', '28.0000', 'rpc_rules_at returns AE factor');
SELECT ok((public.rpc_rules_at('2026-06-01') -> 'conversion' -> 'rows' -> 1 ->> 'is_kv')::boolean, 'conversion rows carry the KV flag');
SELECT ok(public.rpc_rules_at('2025-06-01') -> 'levels' IS NULL OR public.rpc_rules_at('2025-06-01') -> 'levels' = 'null'::jsonb,
  'no rules before 2026');
SELECT throws_ok($$UPDATE public.career_levels SET point_rate = 1$$, '42501', NULL, 'employees cannot write rules');

-- ---------- draft workflow ----------
SELECT throws_ok($$SELECT public.rpc_create_rule_draft('levels', 'Neue Sätze', '2027-01-01')$$, '42501', 'forbidden', 'non-admin cannot draft');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_create_rule_draft('levels', 'Sätze 2027', '2027-01-01') AS draft \gset
SELECT is((SELECT count(*) FROM public.career_levels WHERE rule_version_id = :'draft')::int, 7, 'draft copies the current levels');
SELECT throws_ok($$SELECT public.rpc_create_rule_draft('levels', 'Zweiter Entwurf', '2027-02-01')$$, 'P0001', 'draft_exists', 'only one draft per kind');

SELECT tests.authenticate_as(:'fb');
SELECT is((SELECT count(*) FROM public.rule_versions WHERE id = :'draft')::int, 0, 'employees do not see drafts');
SELECT is((SELECT count(*) FROM public.career_levels WHERE rule_version_id = :'draft')::int, 0, 'employees do not see draft rows');

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_update_level_draft(:'draft', 'FB', 58, 500, 100, 0.10, NULL);
SELECT is((SELECT point_rate FROM public.career_levels WHERE rule_version_id = :'draft' AND code = 'FB'), 58.00::numeric, 'draft rows are editable');
SELECT throws_ok(format($$SELECT public.rpc_update_level_draft(%L, 'FB', 60, 500, 100, 0.10, NULL)$$, :'v_levels'),
  'P0001', 'rule_version_immutable', 'published versions cannot be edited through the RPC');

-- validation on publish
SELECT public.rpc_update_level_draft(:'draft', 'TL', 50, 1000, 300, 0.10, NULL);
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Neue Sätze 2027')$$, :'draft'),
  'P0001', 'levels_not_increasing', 'rates must rise with the level');
SELECT public.rpc_update_level_draft(:'draft', 'TL', 70, 1000, 90, 0.10, NULL);
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Neue Sätze 2027')$$, :'draft'),
  'P0001', 'levels_not_increasing', 'thresholds must rise with the level');
SELECT public.rpc_update_level_draft(:'draft', 'TL', 70, 1000, 300, 0.10, NULL);
SELECT public.rpc_update_level_draft(:'draft', 'FA', 28, NULL, 5, 0.10, NULL);
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Neue Sätze 2027')$$, :'draft'),
  'P0001', 'levels_entry_threshold', 'entry level must start at 0 points');
SELECT public.rpc_update_level_draft(:'draft', 'FA', 28, NULL, 0, 0.10, NULL);
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'kurz')$$, :'draft'),
  '22023', 'reason_required', 'publishing needs a reason');

SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Neue Sätze 2027')$$, :'draft'),
  '42501', 'mfa_required', 'publishing needs MFA');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT lives_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Neue Sätze 2027 laut Beschluss')$$, :'draft'), 'valid draft publishes');
SELECT is(app_private.rule_version_at('levels', '2026-12-31'), :'v_levels'::uuid, 'old version still applies before the new date');
SELECT is(app_private.rule_version_at('levels', '2027-01-01'), :'draft'::uuid, 'new version applies from its date');

-- no retroactive or out-of-order versions
SELECT public.rpc_create_rule_draft('levels', 'Rückwirkend', '2026-02-01') AS past \gset
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Rückwirkende Änderung')$$, :'past'),
  'P0001', 'effective_date_not_future', 'retroactive versions are refused');
SELECT public.rpc_delete_rule_draft(:'past');
SELECT public.rpc_create_rule_draft('levels', 'Zwischendrin', '2026-12-01') AS between \gset
SELECT throws_ok(format($$SELECT public.rpc_publish_rule_version(%L, 'Version vor der neuesten')$$, :'between'),
  'P0001', 'effective_date_not_after_latest', 'versions must come after the latest one');
SELECT public.rpc_delete_rule_draft(:'between');
SELECT throws_ok(format($$SELECT public.rpc_delete_rule_draft(%L)$$, :'v_levels'), 'P0002', 'not_found', 'published versions cannot be deleted as drafts');

-- ---------- level history ----------
SELECT is(public.rpc_set_employee_level(:'e_fb', 'FB', '2026-01-01', 'Einstieg als Fachberater'), 'initial', 'first level is initial');
SELECT throws_ok(format($$SELECT public.rpc_set_employee_level(%L, 'FB', '2026-03-01', 'Erneut FB setzen')$$, :'e_fb'),
  'P0001', 'no_change', 'setting the same level is refused');
SELECT throws_ok(format($$SELECT public.rpc_set_employee_level(%L, 'TL', '2025-12-01', 'Vor dem Eintritt')$$, :'e_fb'),
  'P0001', 'before_start_date', 'not before the start date');
SELECT is(public.rpc_set_employee_level(:'e_fb', 'TL', '2026-05-01', 'Korrektur nach Prüfung der Unterlagen'), 'admin_correction', 'later changes are corrections');
SELECT throws_ok(format($$SELECT public.rpc_set_employee_level(%L, 'OL', '2026-04-01', 'Zurückdatiert')$$, :'e_fb'),
  'P0001', 'before_latest_level', 'no back-dating before the latest entry');
SELECT is(app_private.level_at(:'e_fb', '2026-04-30'), 'FB', 'level on a date before the correction');
SELECT is(app_private.level_at(:'e_fb', '2026-05-01'), 'TL', 'level on the correction date');

SELECT tests.authenticate_as(:'fb');
SELECT is(public.rpc_my_context() -> 'employee' ->> 'level_code', 'TL', 'context shows the current level');
SELECT tests.clear_authentication();
SELECT throws_ok($$UPDATE public.career_level_history SET level_code = 'VD'$$, '42501', 'append_only', 'level history is append-only');

SELECT * FROM finish();
ROLLBACK;
