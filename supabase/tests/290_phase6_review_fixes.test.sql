-- ============================================================
-- Phase 6 review fixes (requirements1/phase-6-automation/verification/r1-p6-verification.md)
-- ============================================================
BEGIN;
SELECT plan(24);

SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('fa@test.local', true) AS fa \gset

SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}') AS t \gset

-- ---------- P6-01: subject is one line ----------
SELECT throws_ok(format($$SELECT public.rpc_save_template_draft(%L, E'Hallo\r\nBcc: x@evil.example', 'Ein ausreichend langer Text.')$$, :'t'),
  '22023', 'subject_line_break', 'P6-01 a line break in the subject is refused');
SELECT tests.clear_authentication();
SELECT is((app_private.render_text(E'Hallo\r\n{{vorname}}', 'Text', '{"vorname": "Erika"}') ->> 'subject'), 'Hallo Erika',
  'P6-01 render_text flattens an authored line break');
SELECT tests.authenticate_as(:'admin', 'aal2');

-- ---------- P6-03: named keys ----------
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}')$$,
  '23505', 'template_name_taken', 'P6-03 duplicate template name');
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, ' geburtstag ', 'birthday', '{consent}')$$,
  '23505', 'template_name_taken', 'P6-03 duplicate name ignores case and spaces');
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, 'ab', 'birthday', '{consent}')$$,
  '22023', 'template_name_length', 'P6-03 name too short');
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, 'Ohne Grundlage', 'birthday', '{}')$$,
  '22023', 'template_bases_required', 'P6-03 no legal basis');
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, 'Falsche Grundlage', 'birthday', '{gefuehl}')$$,
  '22023', 'template_bases_required', 'P6-03 unknown legal basis');
SELECT throws_ok(format($$SELECT public.rpc_save_template_draft(%L, 'Hi', 'Ein ausreichend langer Text.')$$, :'t'),
  '22023', 'subject_length', 'P6-03 subject too short');
SELECT throws_ok(format($$SELECT public.rpc_save_template_draft(%L, 'Alles Gute', 'kurz')$$, :'t'),
  '22023', 'body_length', 'P6-03 body too short');
SELECT throws_ok($$SELECT public.rpc_set_email_window('25:00', '18:00', '{1,2,3,4,5}', 200, 'Versandfenster angepasst')$$,
  '22023', 'invalid_time', 'P6-03 window start 25:00');
SELECT throws_ok($$SELECT public.rpc_set_email_window('9:00', '18:00', '{1,2,3,4,5}', 200, 'Versandfenster angepasst')$$,
  '22023', 'invalid_time', 'P6-04 window needs HH:MM');

-- ---------- P6-07: suppression reason ----------
SELECT throws_ok($$SELECT public.rpc_set_suppression('a@example.org', true, 'weil', NULL)$$,
  '22023', 'suppression_reason_invalid', 'P6-07 unknown reason');
SELECT public.rpc_set_suppression('a@example.org', true, 'manual', NULL);
SELECT public.rpc_set_suppression('A@example.org ', true, 'bounce', 'Zustellung gescheitert');
SELECT is((SELECT reason || '|' || note FROM public.email_suppressions WHERE email = 'a@example.org'), 'bounce|Zustellung gescheitert',
  'P6-07 blocking again updates reason and note');

-- ---------- P6-13: import ----------
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok($$SELECT public.rpc_import_suppressions('[{"email": "x@example.org"}]')$$, '42501', 'forbidden', 'P6-13 advisers cannot import');
SELECT tests.authenticate_as(:'comp');
SELECT throws_ok($$SELECT public.rpc_import_suppressions('[{"email": "x@example.org"}]')$$, '42501', 'mfa_required', 'P6-13 2FA required');
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT throws_ok($$SELECT public.rpc_import_suppressions('[]')$$, '22023', 'import_empty', 'P6-13 empty list');
SELECT throws_ok($$SELECT public.rpc_import_suppressions((SELECT jsonb_agg(jsonb_build_object('email', 'm' || g || '@example.org')) FROM generate_series(1, 10001) g))$$,
  '22023', 'import_too_large', 'P6-13 more than 10,000 rows');
SELECT throws_ok($$SELECT public.rpc_import_suppressions('[{"email": "x@example.org"}]', 'weil')$$,
  '22023', 'suppression_reason_invalid', 'P6-13 unknown default reason');
SELECT public.rpc_import_suppressions($$[
  {"email": " Neu@Example.org "}, {"email": "neu@example.org"}, {"email": "a@example.org"},
  {"email": ""}, {"email": "kein-at"}, {"email": "b@example.org", "reason": "Bounce"}, {"email": "c@example.org", "reason": "spam"}
]$$, 'opt_out') AS res \gset
SELECT is((:'res'::jsonb) - 'errors', '{"added": 2, "already_blocked": 1, "failed": 4}'::jsonb, 'P6-13 counts');
SELECT is((SELECT jsonb_agg(e ->> 'code' ORDER BY (e ->> 'row')::int) FROM jsonb_array_elements((:'res'::jsonb) -> 'errors') e),
  '["duplicate_in_file", "email_missing", "invalid_email", "suppression_reason_invalid"]'::jsonb, 'P6-13 per-row error codes');
SELECT ok(NOT ((:'res')::text ILIKE '%example.org%'), 'P6-13 the result carries no addresses');
SELECT is((SELECT reason FROM public.email_suppressions WHERE email = 'neu@example.org'), 'opt_out', 'P6-13 default reason applied');
SELECT is((SELECT reason FROM public.email_suppressions WHERE email = 'b@example.org'), 'bounce', 'P6-13 per-row reason wins');
SELECT is((SELECT reason FROM public.email_suppressions WHERE email = 'a@example.org'), 'bounce', 'P6-13 an existing block is kept as it was');

SELECT * FROM finish();
ROLLBACK;
