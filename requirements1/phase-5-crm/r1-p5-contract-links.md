# r1/p5/contract-links — contracts on the customer, sync intake

Branch `r1/p5/contract-links` → merged into `r1/p5-crm`.
Spec: §10.1 (links to contracts / portal, sync timestamp, source system), §10.3 (no unverified dates), §10.4 (integration strategy), §11.2 (sync failures).

## What was built

**Database** — `supabase/migrations/20261029120000_contract_links.sql`

| Object | Purpose |
|---|---|
| `contract_links` | One row per contract. **(source_system, external_contract_id) is unique**, so a manual entry and a later sync of the same contract never become two rows. Holds category, product, insurer, status (in Bearbeitung / aktiv / gekündigt / beendet / unbekannt), start, renewal and end date, an optional link to a `production_records` row, `last_synced_at`, the sync run and `archived_at`. |
| Dates | Dates are stored **only with their origin**: `portal` (sync) or `manual_confirmed` (who confirmed them from the documents, `dates_confirmed_by`). A CHECK constraint enforces this. |
| `sync_runs`, `sync_errors` | One row per sync run with total, ok and failed counts and a status (succeeded / partial / failed). Each error stores **metadata only**: row number, external customer and contract id, and an error code. The raw payload is never stored. Admins read both tables. |
| `app_settings.contract_portal` | `sources` (default `manual`, `portal`) and `hosts`. If `hosts` is set, deep links must point to one of them. Every deep link must be https. |

**RPCs**
- `rpc_save_contract_link(id, customer, data, dates_confirmed)`: create or edit manually (adviser, managers, admins with MFA).
  - Dates are rejected unless confirmed (`dates_unconfirmed`), and a duplicate number gives `contract_exists`.
  - Unknown fields and unknown source systems are rejected.
  - A linked production record must be visible to the caller.
  - **Synced contracts are read-only** except for the production link (`synced_read_only`).
- `rpc_archive_contract_link(id, reason)`: soft delete.
- `rpc_link_customer_external(customer, source, external_id)`: the customer's number in the portal, used to match synced contracts. It must be unique per system (`external_id_taken`).
- `rpc_ingest_contracts(source, rows)`: **service role only**, for the future portal adapter (OD-14).
  - **Matching and update**: it matches customers by external id and upserts by contract number. On a re-sync the portal is authoritative and overwrites status and dates.
  - **Errors**: each bad row is recorded with an error code (`customer_not_found`, `contract_id_missing`, `invalid_date`, `unknown_category`, `invalid_value`, `invalid_deep_link`) and the rest of the run continues.
  - **Limits**: at most 10,000 rows per run, and `manual` can't be used as a sync source.

**Frontend**
- `useContracts(customerId)` hook.
- `ContractsCard` on the customer page:
  - Each contract shows status and number, with the source and sync time.
  - Dates are labelled „laut Vertragsportal“ or „aus Unterlagen bestätigt“, and there's an „Im Portal öffnen“ link (`noopener noreferrer`).
  - Manual links can be removed with a reason.
  - A field for the customer's number in the portal.
- Form „Vertrag verknüpfen“: dates can only be saved after ticking „anhand der Vertragsunterlagen geprüft“; only https links are accepted.
- German error texts for the new keys.

## Tests
- pgTAP `210_contract_links.test.sql` (22): manual link; duplicate number; unconfirmed dates rejected; confirmed dates record who confirmed them; https-only links; unknown source/fields; editing; unique external customer id; peers see and do nothing; users can't call the intake; a mixed sync run (1 ok, 3 errors, status partial, correct codes, **no payload in the errors**); synced dates marked as portal data; re-sync updates instead of duplicating; the portal is authoritative; synced contracts are read-only; admins see the runs.
- Totals: 655 pgTAP assertions (22 files), 348 unit tests, 47 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. On a customer, link „LV-123“, then link it again: rejected.
2. Enter a renewal date without ticking the box: the button stays disabled (the API refuses too).
3. Enter an `http://` link: rejected.
4. Simulate a sync in the SQL editor:
   - Set the customer's portal number (e.g. `P-1001`).
   - Run `select public.rpc_ingest_contracts('portal', '[{"external_customer_id":"P-1001","external_contract_id":"V-1","status":"active"}]');` as service role.
   - The contract appears with „synchronisiert …“ and can't be removed or edited.
   - `select * from sync_runs` shows the run.

## Edge cases & decisions
- **No portal integration yet (OD-14).** The intake is ready for an Edge Function adapter (export, API or scheduled report), and nothing scrapes (§10.4). The adapter has to call the RPC with the service role.
- A synced contract whose customer link changes in the portal is moved to the new customer on the next run (the portal is authoritative).
- Contracts that disappear from the portal aren't deleted automatically. Their `last_synced_at` stops moving; a "missing in last run" check can be added once the export format is known.
- Contract data is **not** shared with finance (no customer access). Commission stays tied to production records, not to contract links.
- Service reminders (next slice) use **only confirmed dates** from here.
