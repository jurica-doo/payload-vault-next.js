-- ============================================================
-- r1/p1/audit
-- ============================================================
BEGIN;
SELECT plan(27);

-- A throwaway audited table for this test only.
CREATE TABLE public.audit_probe (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  secret     text,
  updated_at timestamptz DEFAULT now()
);
SELECT app_private.attach_audit('public.audit_probe', 'id', '{updated_at}', '{secret}');
GRANT SELECT, INSERT, UPDATE ON public.audit_probe TO authenticated;

SELECT tests.create_user('auditor@test.local') AS uid \gset

-- ---------- insert ----------
INSERT INTO public.audit_probe (id, name, secret) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Anna', 'pw');
SELECT is((SELECT count(*) FROM audit.events WHERE entity_type = 'public.audit_probe')::int, 1, 'insert is logged');
SELECT is((SELECT action FROM audit.events WHERE entity_type = 'public.audit_probe'), 'insert', 'action is insert');
SELECT is((SELECT entity_id FROM audit.events WHERE entity_type = 'public.audit_probe'), '00000000-0000-0000-0000-0000000000a1', 'entity id from id column');
SELECT is((SELECT new_values ->> 'secret' FROM audit.events WHERE entity_type = 'public.audit_probe'), '[redacted]', 'redacted column is masked');
SELECT ok(NOT (SELECT new_values ? 'updated_at' FROM audit.events WHERE entity_type = 'public.audit_probe'), 'ignored column is left out of snapshots');
SELECT is((SELECT actor_kind FROM audit.events WHERE entity_type = 'public.audit_probe'), 'system', 'no JWT → system actor');

-- ---------- update: only changed columns, with reason + correlation id ----------
SELECT app_private.set_audit_context('Name korrigiert nach Rückmeldung', '11111111-1111-1111-1111-111111111111');
UPDATE public.audit_probe SET name = 'Anne', updated_at = now() + interval '1 minute';
SELECT is(
  (SELECT jsonb_build_array(old_values, new_values) FROM audit.events WHERE action = 'update' AND entity_type = 'public.audit_probe'),
  '[{"name": "Anna"}, {"name": "Anne"}]'::jsonb, 'update stores only the changed columns');
SELECT is((SELECT reason FROM audit.events WHERE action = 'update' AND entity_type = 'public.audit_probe'), 'Name korrigiert nach Rückmeldung', 'reason captured');
SELECT is((SELECT correlation_id FROM audit.events WHERE action = 'update' AND entity_type = 'public.audit_probe'), '11111111-1111-1111-1111-111111111111'::uuid, 'correlation id captured');

UPDATE public.audit_probe SET updated_at = now() + interval '2 minutes';
SELECT is((SELECT count(*) FROM audit.events WHERE action = 'update' AND entity_type = 'public.audit_probe')::int, 1, 'touch-only update is not logged');

UPDATE public.audit_probe SET name = 'Anne';
SELECT is((SELECT count(*) FROM audit.events WHERE action = 'update' AND entity_type = 'public.audit_probe')::int, 1, 'no-op update is not logged');

-- invalid correlation id is ignored, not an error
SELECT set_config('app.correlation_id', 'not-a-uuid', true);
SELECT lives_ok($$UPDATE public.audit_probe SET name = 'Annette'$$, 'invalid correlation id does not break the write');
SELECT ok((SELECT correlation_id IS NULL FROM audit.events WHERE new_values ->> 'name' = 'Annette'), 'invalid correlation id stored as null');
SELECT app_private.set_audit_context(NULL);

-- ---------- actors ----------
SELECT tests.authenticate_as(:'uid');
UPDATE public.audit_probe SET name = 'Anja';
SELECT tests.clear_authentication();
SELECT is((SELECT actor_id FROM audit.events WHERE new_values ->> 'name' = 'Anja'), :'uid'::uuid, 'user actor recorded');
SELECT is((SELECT actor_kind FROM audit.events WHERE new_values ->> 'name' = 'Anja'), 'user', 'actor kind user');

SELECT tests.authenticate_as_service_role();
UPDATE public.audit_probe SET name = 'Annika';
SELECT tests.clear_authentication();
SELECT is((SELECT actor_kind FROM audit.events WHERE new_values ->> 'name' = 'Annika'), 'service', 'service role actor');

-- ---------- delete ----------
DELETE FROM public.audit_probe;
SELECT is((SELECT old_values ->> 'name' FROM audit.events WHERE action = 'delete' AND entity_type = 'public.audit_probe'), 'Annika', 'delete keeps the old snapshot');

-- ---------- require_reason ----------
SELECT throws_ok($$SELECT app_private.require_reason('  kurz   ')$$, '22023', 'reason_required', 'short reason rejected after trimming');
SELECT throws_ok($$SELECT app_private.require_reason(NULL)$$, '22023', 'reason_required', 'missing reason rejected');
SELECT throws_ok(format('SELECT app_private.require_reason(%L)', repeat('x', 501)), '22023', 'reason_too_long', 'overlong reason rejected');
SELECT is(app_private.require_reason('  Teamwechsel Nord  '), 'Teamwechsel Nord', 'reason trimmed and returned');
SELECT is(current_setting('app.reason', true), 'Teamwechsel Nord', 'reason registered for the trigger');

-- ---------- log_event ----------
SELECT app_private.log_event('employee.invite_sent', 'public.employees', 'e-1', '{"email": "x@y.de"}');
SELECT is((SELECT new_values ->> 'email' FROM audit.events WHERE action = 'employee.invite_sent'), 'x@y.de', 'explicit event logged');

-- ---------- append-only, for every role ----------
SELECT throws_ok($$UPDATE audit.events SET reason = 'x'$$, '42501', 'audit_append_only', 'UPDATE refused even for postgres');
SELECT throws_ok($$DELETE FROM audit.events$$, '42501', 'audit_append_only', 'DELETE refused even for postgres');
SELECT throws_ok($$TRUNCATE audit.events$$, '42501', 'audit_append_only', 'TRUNCATE refused');

-- ---------- not reachable from the API ----------
SELECT ok(NOT has_schema_privilege('authenticated', 'audit', 'USAGE')
          AND NOT has_schema_privilege('anon', 'audit', 'USAGE'), 'API roles have no USAGE on schema audit');

SELECT * FROM finish();
ROLLBACK;
