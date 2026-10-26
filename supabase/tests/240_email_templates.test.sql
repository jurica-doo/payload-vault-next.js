-- ============================================================
-- r1/p6/email-templates
-- ============================================================
BEGIN;
SELECT plan(24);

-- ---------- rendering (golden cases, mirrored in src/domain/emailTemplate.test.ts) ----------
SELECT is(app_private.render_text('Alles Gute, {{rufname}}!', 'Text', '{"rufname": "Erika"}') ->> 'subject', 'Alles Gute, Erika!',
  'GC-MERGE-001 subject merge');
SELECT is(app_private.render_text('S', 'Hallo {{vorname}} <b>', '{"vorname": "<script>"}') ->> 'html', '<p>Hallo &lt;script&gt; &lt;b&gt;</p>',
  'GC-MERGE-002 HTML is escaped, template and values alike');
SELECT is(app_private.render_text('S', 'Hallo {{vorname}} <b>', '{"vorname": "<script>"}') ->> 'text', 'Hallo <script> <b>',
  'GC-MERGE-002 plain text stays as written');
SELECT is(app_private.render_text('S', 'Liebe {{vorname}}, {{jahr}}', '{"jahr": "2026"}') -> 'missing', '["vorname"]'::jsonb,
  'GC-MERGE-003 missing values are reported');
SELECT is(app_private.render_text('Hi {{name}}', 'Text', jsonb_build_object('name', E'A\r\nBcc: x')) ->> 'subject', 'Hi A Bcc: x',
  'GC-MERGE-004 no line breaks in the subject (header injection)');
SELECT is(app_private.render_text('S', E'A\n\nB\nC', '{}') ->> 'html', '<p>A</p><p>B<br>C</p>', 'GC-MERGE-005 paragraphs and line breaks');
SELECT is(app_private.render_text('S', 'Hallo {{ vorname }}', '{"vorname": "Max"}') ->> 'text', 'Hallo Max', 'GC-MERGE-006 spaces inside braces');
SELECT is(app_private.render_text('S', 'Pfad {{vorname}}', jsonb_build_object('vorname', 'C:\1 & $x')) ->> 'text', 'Pfad C:\1 & $x',
  'GC-MERGE-007 special characters in values are literal');
SELECT throws_ok($$SELECT app_private.check_template_text('Hallo {{iban}}')$$, '22023', 'unknown_merge_field', 'only whitelisted fields');
SELECT throws_ok($$SELECT app_private.check_template_text('Hallo {{vorname')$$, '22023', 'invalid_template', 'malformed placeholders rejected');

-- ---------- setup ----------
SELECT tests.create_user('admin@test.local', true) AS admin \gset
SELECT tests.grant_role(:'admin', 'admin');
SELECT tests.create_user('comp@test.local') AS comp \gset
SELECT tests.grant_role(:'comp', 'compliance');
SELECT tests.create_user('fa@test.local', true) AS fa \gset

-- ---------- permissions ----------
SELECT tests.authenticate_as(:'fa');
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}')$$, '42501', 'forbidden', 'advisers cannot manage templates');
SELECT is((SELECT count(*) FROM public.email_templates)::int, 0, '…nor read them');
SELECT tests.authenticate_as(:'admin', 'aal1');
SELECT throws_ok($$SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}')$$, '42501', 'mfa_required', 'MFA required');

-- ---------- lifecycle ----------
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_save_email_template(NULL, 'Geburtstag', 'birthday', '{consent}') AS t \gset
SELECT public.rpc_save_template_draft(:'t', 'Alles Gute, {{rufname}}!', E'Liebe/r {{rufname}},\n\nherzlichen Glückwunsch.\n{{berater_name}}') AS v1 \gset
SELECT is(public.rpc_save_template_draft(:'t', 'Alles Gute zum Geburtstag, {{rufname}}!', E'Liebe/r {{rufname}},\n\nalles Gute.\n{{berater_name}}'),
  :'v1'::uuid, 'editing updates the open draft');
SELECT is(public.rpc_preview_template(:'v1') ->> 'subject', 'Alles Gute zum Geburtstag, Erika!', 'preview with sample data');
SELECT public.rpc_submit_template_version(:'v1');
SELECT throws_ok(format($$SELECT public.rpc_save_template_draft(%L, 'Neu', 'Neuer Text hier')$$, :'t'), 'P0001', 'awaiting_review',
  'no edits while waiting for approval');
SELECT throws_ok(format($$SELECT public.rpc_decide_template_version(%L, true)$$, :'v1'), '42501', 'cannot_approve_own', 'four-eyes: author cannot approve');
SELECT tests.authenticate_as(:'comp', 'aal2');
SELECT throws_ok(format($$SELECT public.rpc_decide_template_version(%L, false)$$, :'v1'), '22023', 'reason_required', 'rejection needs a reason');
SELECT public.rpc_decide_template_version(:'v1', true);
SELECT is((SELECT active_version_id FROM public.email_templates WHERE id = :'t'), :'v1'::uuid, 'approved version becomes active');

-- v2 replaces v1
SELECT public.rpc_save_template_draft(:'t', 'Herzlichen Glückwunsch, {{rufname}}', 'Kurzer Text für {{rufname}}.') AS v2 \gset
SELECT public.rpc_submit_template_version(:'v2');
SELECT tests.authenticate_as(:'admin', 'aal2');
SELECT public.rpc_decide_template_version(:'v2', true);
SELECT is((SELECT status FROM public.email_template_versions WHERE id = :'v1'), 'retired', 'previous version retired');
SELECT is((SELECT active_version_id FROM public.email_templates WHERE id = :'t'), :'v2'::uuid, 'new version active');
SELECT tests.clear_authentication();
SELECT throws_ok(format($$UPDATE public.email_template_versions SET body = 'Geändert nach Freigabe' WHERE id = %L$$, :'v2'), '42501',
  'template_version_immutable', 'approved content is immutable');
SELECT throws_ok(format($$DELETE FROM public.email_template_versions WHERE id = %L$$, :'v1'), '42501', 'template_version_immutable', 'retired versions stay');
SELECT ok(EXISTS (SELECT 1 FROM audit.events WHERE entity_type = 'public.email_template_versions' AND reason = 'Vorlage freigegeben'),
  'approvals are audited (§12.3)');

SELECT * FROM finish();
ROLLBACK;
