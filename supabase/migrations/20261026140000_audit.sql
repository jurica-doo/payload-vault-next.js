-- ============================================================
-- r1/p1/audit: append-only audit trail (spec §12.3)
-- ============================================================
-- Every sensitive change (career level, reporting line, production values,
-- rates, reserve, subsidy, lead ownership, consent, templates, roles, …)
-- must be traceable: actor, time, old value, new value, reason.
--
-- Design
--   audit.events            append-only table; not exposed through the API
--                           (schema `audit` has no USAGE for anon/authenticated).
--                           Reads go through RPCs that check permissions
--                           (added with r1/p1/identity-roles).
--   audit.log_change()      generic AFTER trigger. Records only the columns
--                           that changed, skips "touch" updates (updated_at
--                           only), can redact columns, and picks up the reason
--                           and correlation id set by the calling RPC.
--   app_private.attach_audit(table, …)   one call per audited table.
--   app_private.require_reason(text)     validates + registers the reason.
--   app_private.set_audit_context(…)     reason / correlation id for the
--                                         current transaction.
--   app_private.log_event(…)             explicit events that are not a row
--                                         change (invite sent, export, …).
--
-- Errors raised by app code use stable machine keys as the message
-- (e.g. 'reason_required') so the frontend can map them to German text.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS audit;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON SCHEMA audit FROM anon, authenticated;
GRANT USAGE ON SCHEMA audit TO service_role;

CREATE TABLE IF NOT EXISTS audit.events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  actor_id       uuid,
  actor_kind     text NOT NULL CHECK (actor_kind IN ('user', 'service', 'system')),
  action         text NOT NULL CHECK (action ~ '^[a-z][a-z_.]*$'),
  entity_type    text NOT NULL,
  entity_id      text NOT NULL,
  old_values     jsonb,
  new_values     jsonb,
  reason         text,
  correlation_id uuid,
  txid           bigint NOT NULL DEFAULT txid_current()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit.events (entity_type, entity_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor  ON audit.events (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_corr   ON audit.events (correlation_id) WHERE correlation_id IS NOT NULL;

REVOKE ALL ON audit.events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON audit.events TO service_role;

-- ---------- append-only guard (applies to every role, incl. service_role) ----------
CREATE OR REPLACE FUNCTION audit.forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_append_only'
    USING ERRCODE = '42501',
          DETAIL  = format('%s on audit.events is not allowed', TG_OP);
END
$$;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit.events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit.events
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_mutation();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit.events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit.events
  FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation();

-- ---------- context for the current transaction ----------
CREATE OR REPLACE FUNCTION app_private.set_audit_context(
  p_reason         text,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT set_config('app.reason', coalesce(p_reason, ''), true),
         set_config('app.correlation_id', coalesce(p_correlation_id::text, ''), true);
$$;

-- Validates a user-supplied reason (trimmed, min length) and registers it for
-- the audit trigger. Returns the trimmed reason.
CREATE OR REPLACE FUNCTION app_private.require_reason(
  p_reason     text,
  p_min_length integer DEFAULT 10
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF length(v_reason) < p_min_length THEN
    RAISE EXCEPTION 'reason_required'
      USING ERRCODE = '22023',
            DETAIL  = format('a reason of at least %s characters is required', p_min_length);
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('app.reason', v_reason, true);
  RETURN v_reason;
END
$$;

-- ---------- generic row-change trigger ----------
-- Trigger arguments (all optional, as text):
--   [0] id column            default 'id'
--   [1] ignored columns      text[] literal, default '{updated_at}'
--   [2] redacted columns     text[] literal, default '{}'
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id_col  text   := coalesce(TG_ARGV[0], 'id');
  v_ignore  text[] := coalesce(TG_ARGV[1], '{updated_at}')::text[];
  v_redact  text[] := coalesce(TG_ARGV[2], '{}')::text[];
  v_old     jsonb;
  v_new     jsonb;
  v_actor   uuid   := auth.uid();
  v_corr    uuid;
  v_key     text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(n.key, v_old -> n.key), jsonb_object_agg(n.key, n.value)
      INTO v_old, v_new
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
       AND NOT n.key = ANY (v_ignore);
    IF v_new IS NULL THEN
      RETURN NULL; -- nothing but ignored columns changed
    END IF;
  ELSE
    v_old := v_old - v_ignore;
    v_new := v_new - v_ignore;
  END IF;

  FOREACH v_key IN ARRAY v_redact LOOP
    IF v_old ? v_key THEN v_old := jsonb_set(v_old, ARRAY[v_key], '"[redacted]"'); END IF;
    IF v_new ? v_key THEN v_new := jsonb_set(v_new, ARRAY[v_key], '"[redacted]"'); END IF;
  END LOOP;

  BEGIN
    v_corr := nullif(current_setting('app.correlation_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_corr := NULL;
  END;

  INSERT INTO audit.events
    (actor_id, actor_kind, action, entity_type, entity_id, old_values, new_values, reason, correlation_id)
  VALUES (
    v_actor,
    CASE WHEN v_actor IS NOT NULL THEN 'user'
         WHEN coalesce(auth.role(), '') = 'service_role' THEN 'service'
         ELSE 'system' END,
    lower(TG_OP),
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    coalesce(to_jsonb(NEW), to_jsonb(OLD)) ->> v_id_col,
    v_old,
    v_new,
    nullif(current_setting('app.reason', true), ''),
    v_corr
  );
  RETURN NULL;
END
$$;

REVOKE EXECUTE ON FUNCTION audit.log_change() FROM PUBLIC, anon, authenticated;

-- One call per audited table:
--   SELECT app_private.attach_audit('public.employees');
--   SELECT app_private.attach_audit('public.customers', 'id', '{updated_at}', '{date_of_birth}');
CREATE OR REPLACE FUNCTION app_private.attach_audit(
  p_table   regclass,
  p_id_col  text   DEFAULT 'id',
  p_ignore  text[] DEFAULT '{updated_at}',
  p_redact  text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_changes ON %s', p_table);
  EXECUTE format(
    'CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION audit.log_change(%L, %L, %L)',
    p_table, p_id_col, p_ignore::text, p_redact::text);
END
$$;

-- Explicit events that aren't a row change in an audited table.
CREATE OR REPLACE FUNCTION app_private.log_event(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_details     jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_corr  uuid;
BEGIN
  BEGIN
    v_corr := nullif(current_setting('app.correlation_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_corr := NULL;
  END;
  INSERT INTO audit.events
    (actor_id, actor_kind, action, entity_type, entity_id, new_values, reason, correlation_id)
  VALUES (
    v_actor,
    CASE WHEN v_actor IS NOT NULL THEN 'user'
         WHEN coalesce(auth.role(), '') = 'service_role' THEN 'service'
         ELSE 'system' END,
    p_action, p_entity_type, p_entity_id, p_details,
    nullif(current_setting('app.reason', true), ''),
    v_corr);
END
$$;

REVOKE EXECUTE ON FUNCTION app_private.set_audit_context(text, uuid),
                           app_private.require_reason(text, integer),
                           app_private.attach_audit(regclass, text, text[], text[]),
                           app_private.log_event(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
