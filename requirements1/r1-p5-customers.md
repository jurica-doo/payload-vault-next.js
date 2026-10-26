# r1/p5/customers — central customer list and lead conversion

Branch `r1/p5/customers` → merged into `r1/p5-crm`.
Spec: §10.1 (customer profile), §9.1 Conversion, §12.2 (hierarchy-based access, soft deletion), §14.5.

## What was built

**Database** — `supabase/migrations/20261029100000_customers.sql`
- `customers` fields:
  - Customer number (`K-00001`), name or company, preferred name, birth date (optional).
  - Phone (E.164), email (lowercase), address, preferred channel (+ letter), status (Interessent / Aktiv / Inaktiv / Ehemalig).
  - **Adviser (`owner_id`, required)**, source lead, `source_system` + `external_id` (unique pair, for the contract-portal sync), `last_synced_at`.
  - Next follow-up, notes, `archived_at` (soft delete) and `erased_at` (pseudonymised; set by privacy-ops).
- `customer_assignments`: **append-only** adviser history with reason.
- Audit: changes are audited with name, birth date, contact, address and notes **redacted**.
- Visibility (**OD-13**, provisional):
  - The adviser and the adviser's managers.
  - Admins and **compliance** (read-only).
  - **Finance has no customer access.**
- Writes go only through RPCs, and admins need MFA unless they are the adviser or the adviser's manager.
- RPCs:
  - `rpc_create_customer(data, owner, confirm_duplicates)`: duplicate check like for leads (phone, email, similar name); other advisers' customers come back without details. Unknown fields are rejected.
  - `rpc_update_customer(id, data)`: only the keys present are written.
  - `rpc_assign_customer(id, owner, reason)`: reason required. Only to yourself or someone in your structure (admins with MFA: anyone). The new adviser is notified.
  - `rpc_archive_customer(id, archived, reason)`: soft delete and reactivate, both with a reason.
  - `rpc_convert_lead(lead, confirm_duplicates)`: creates the customer from the lead's identity and adviser, links both ways (`leads.customer_id` ↔ `customers.lead_id`, so the lead source stays reachable, §14.5), and closes an open lead as **won**. A lead can be converted only once and only once it has an adviser.
- Activities can now be linked to customers (`check_activity_link`): the customer must exist and not be erased, and the caller must be allowed to work on it.
- Task generator: `next_follow_up_at` within a day → a „Kunde nachfassen“ task (`customer_service`) for the adviser. It closes when the date is cleared or moved. `run_task_generators()` = core + leads + customers.

**Frontend**
- `useCustomers` hook (list, detail, duplicates, create/update/assign/archive/convert).
- `/vertrieb/kunden`:
  - Tabs: Meine / Team (leaders) / Alle (compliance and admins without an employee record) / Archiviert.
  - Search by name, company, K-number, phone, email or postcode.
  - Erased customers are shown only as „Gelöscht (pseudonymisiert)“.
- `CustomerForm` (create and edit). The birth date is labelled „nur wenn nötig“ (data minimisation, §10.5).
- `/vertrieb/kunden/[id]`:
  - Profile with edit, and archive/reactivate (with reason).
  - Next follow-up, adviser with history and reassignment, and the contact history (shared `ActivityPanel`) with a link to the earlier lead.
- Lead detail: „In Kunden umwandeln“, with a customer duplicate check first. After conversion it shows „Zum Kunden →“.
- `DuplicateWarning`: a shared component, now used by the lead form, the customer form and conversion.
- Modules: new audience `compliance`, so compliance users see the Kunden module (read-only in the UI; the database enforces it).
- Notifications `customer_assigned` and `customer_service` can be muted. Task links open the customer.

## Tests
- pgTAP `190_customers.test.sql` (29):
  - Create and validation, and the duplicate warning.
  - Visibility for adviser, manager, peer, finance and compliance (read, no write).
  - PII redacted in the audit log; reassignment rules; the previous adviser loses access.
  - Archive with reason; customer activities and their permission check.
  - Lead conversion (link, identity, won, only once).
- Vitest: `CustomersPage.test.tsx` (3).
- Totals: 611 pgTAP assertions (20 files), 344 unit tests, 47 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. Turn on the `customers` flag. Create a customer, then another one with the same phone number: you get the warning and must confirm.
2. Convert a lead: the customer opens, the lead shows „Gewonnen“ and „Zum Kunden →“, and the customer page links back to the lead.
3. As a leader, reassign a customer (reason required). The previous adviser no longer sees them.
4. Log in as a compliance user: the customer list is visible, but no create/edit/assign buttons appear, and the API refuses changes.
5. Archive and reactivate: the customer disappears from and returns to „Meine“.

## Edge cases & decisions
- **Compliance reads full customer profiles** (consents need the person they belong to). If Profina wants less, a masked view can replace the table read. This is noted under OD-13.
- **The birth date is optional** and redacted in the audit log. Birthday emails (Phase 6) will additionally need a consent for that purpose.
- A customer always has an adviser (no pool, unlike leads). Deactivated advisers keep their customers until reassigned. An automatic reassignment queue is possible later, like the tasks one.
- The customer duplicate check covers **customers only**. A lead and a customer for the same person are linked by conversion, not by the check.
- Conversion copies identity at that moment. Later edits to the lead are not synced (the lead is closed).
- Archived customers stay readable and can still receive activities after reactivation. Erased customers are read-only.
