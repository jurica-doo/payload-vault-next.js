# r1/p1/audit — Append-only audit trail

| | |
|---|---|
| Branch | `r1/p1/audit` → merged into `r1/p1-foundation` |
| Plan section | IMPLEMENTATION_PLAN.md §3.8, §4.4, §6 Phase 1 · `r1/p1/audit`; spec §12.3 |
| Status | Done; 27 new pgTAP assertions (65 in total) |
| Date | 2026-10-26 |

## What was done
Migration `20261026140000_audit.sql`:

| Object | Purpose |
|---|---|
| schema `audit` | Not exposed: anon/authenticated have no `USAGE`. Reads come through permission-checked RPCs (first one: `rpc_audit_for` in `r1/p1/identity-roles`). |
| `audit.events` | `id, at, actor_id, actor_kind (user/service/system), action, entity_type, entity_id, old_values, new_values, reason, correlation_id, txid`. Indexed by entity, actor and correlation id. |
| `audit.forbid_mutation()` + 2 triggers | **Append-only for every role**, including `postgres` and `service_role`: UPDATE, DELETE and TRUNCATE raise `audit_append_only` (SQLSTATE 42501). |
| `audit.log_change()` | Generic `AFTER INSERT/UPDATE/DELETE` row trigger (`SECURITY DEFINER`, `search_path = ''`). On update it stores **only the changed columns**, old and new. It skips updates where only ignored columns changed (default `updated_at`) and no-op updates, masks redacted columns as `"[redacted]"`, and reads the reason and correlation id from the transaction settings. |
| `app_private.attach_audit(table, id_col, ignore[], redact[])` | One line per audited table, e.g. `select app_private.attach_audit('public.employees');` |
| `app_private.require_reason(text, min=10)` | Trims, enforces 10–500 characters (`reason_required` / `reason_too_long`, SQLSTATE 22023) and registers the reason for the trigger. Every sensitive RPC calls this first. |
| `app_private.set_audit_context(reason, correlation_id)` | For system jobs and bulk operations (one correlation id per import batch). |
| `app_private.log_event(action, entity_type, entity_id, details)` | Events that aren't a row change: invite sent, export, login-relevant actions. |

All helpers have EXECUTE revoked from PUBLIC/anon/authenticated; they're called from inside other `SECURITY DEFINER` functions.

### Conventions introduced (used by all later slices)
- **Error messages are machine keys** (`reason_required`, `audit_append_only`, …), with the SQLSTATE telling the kind: `42501` permission, `22023` invalid input, `23xxx` constraint, `P0001` business rule. The frontend maps keys to German text, so DB messages never need translating.
- **How an RPC is audited:** `perform app_private.require_reason(p_reason);`, then write; the trigger records the rest. No RPC writes to `audit.events` directly, except through `log_event` for non-row events.

## How to verify
```bash
npm run test:db -- 020_audit
```
Manually (staging SQL editor):
```sql
select * from audit.events order by id desc limit 20;
update audit.events set reason = 'x';  -- must fail with audit_append_only
```

## What to look out for
- **Volume.** Every audited row change writes one row. Bulk imports (Phase 1 production) will write one event per row. Set a correlation id per batch so they can be grouped, and keep an eye on table size. There's no retention job yet (plan **OD-16**).
- **Redaction is per table.** When attaching audit to tables with sensitive data (customer date of birth, consent evidence, coaching notes), pass the columns in `p_redact`. Otherwise their values end up in the audit trail in plain text.
- **Reason scope.** `app.reason` is transaction-local (`set_config(…, true)`), so it can't leak into another request. Two writes in one transaction share one reason; that's intended for one user action.
- **Ignored columns** default to `updated_at`. Add computed columns (e.g. `search_vector`) to `p_ignore`, or every recalculation produces noise.
- `actor_kind = 'system'` means no JWT at all (cron, migrations, SQL editor). `service` means the Edge Function service role. When a service-role function acts for a user, it should put the user id into `details` via `log_event`, because `actor_id` will be null.
- **Restoring a backup** that includes `audit.events` works (INSERT is allowed). Deleting old events requires dropping the guard trigger in a reviewed migration, deliberately.

## Edge cases covered by tests
- insert/update/delete snapshots; entity id taken from the configured column
- update stores only changed columns (`{"name":"Anna"}` → `{"name":"Anne"}`)
- touch-only update (`updated_at`) and no-op update produce **no** event
- redacted column masked; ignored column left out of snapshots
- reason and correlation id captured; an **invalid correlation id is ignored**, not an error
- actor kinds: user (with id), service role, system
- `require_reason`: whitespace-padded short text, NULL, > 500 characters; trimmed value returned and registered
- explicit `log_event`
- UPDATE / DELETE / TRUNCATE refused even for `postgres`
- API roles have no `USAGE` on the `audit` schema
