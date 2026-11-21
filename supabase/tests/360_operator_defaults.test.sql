-- ============================================================
-- Operator defaults (migration 20261101210000): sender tag, lead SLA with
-- NRW holidays, retention defaults
-- ============================================================
BEGIN;
SELECT plan(9);

SELECT is(app_private.sender_tag('Nora.Neumann@pro-fina.de'), 'nora.neumann', 'tag = local part, lower case');
SELECT is(app_private.sender_tag('o''brien+crm@example.org'), 'obriencrm', 'unsafe characters removed');
SELECT is(app_private.sender_tag('.x.@example.org'), 'x', 'no leading or trailing dot');
SELECT is(app_private.sender_tag(NULL), NULL, 'no e-mail → no tag (EMAIL_FROM is used)');

SELECT is((SELECT value ->> 'holiday_region' FROM public.app_settings WHERE key = 'lead_sla'), 'DE-NW', 'NRW holidays (Lüdenscheid)');
SELECT ok(NOT (SELECT (value ->> 'provisional')::boolean FROM public.app_settings WHERE key = 'lead_sla'), 'SLA saved as decided: no provisional notice');
SELECT is(app_private.add_business_hours('2026-06-03 16:00 Europe/Berlin', 8), '2026-06-05 16:00 Europe/Berlin'::timestamptz,
  'Fronleichnam (NRW) is skipped');

SELECT is((SELECT (value ->> 'customer_years')::int FROM public.app_settings WHERE key = 'retention'), 10, 'customers: 10 years');
SELECT is((SELECT (value ->> 'lead_years')::int FROM public.app_settings WHERE key = 'retention'), 2, 'leads: 2 years');

SELECT * FROM finish();
ROLLBACK;
