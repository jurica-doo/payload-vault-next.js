# r1/p5/service-reminders — customer service items and their tasks

Branch `r1/p5/service-reminders` → merged into `r1/p5-crm`.
Spec: §10.1 (upcoming service dates, customer-care tasks), §10.3, §11.2.

## What was built

**Database** — `supabase/migrations/20261029130000_service_reminders.sql`
- `customer_service_items`:
  - Kinds: annual review (Jahresgespräch), pending documents, follow-up after advice, contract renewal (Hauptfälligkeit), other.
  - Each item has a title, due date, responsible owner (default: the adviser; leaders can choose someone in their structure), recurrence (once/yearly), an optional contract and a note.
  - Status: open → done/cancelled. Done yearly items keep a link to the previous occurrence (`previous_id`). Audited, with the note redacted.
- **Renewal reminders use only confirmed dates.**
  - The due date is computed from the linked contract's `renewal_date`, and only if that date came from the portal or was confirmed from the documents. The date typed in the form is ignored.
  - Without a confirmed date the request fails with `renewal_date_unconfirmed` (§10.3: no assumptions about policy anniversaries).
- `app_private.next_anniversary(date, from)`: 29 Feb falls on 28 Feb in common years. It's mirrored in `src/domain/serviceDates.ts` with golden cases **GC-SERVICE-001…004**, so parity is now **51** IDs.
- `rpc_save_service_item(...)`, `rpc_set_service_item_status(id, done|cancelled, note)`.
  - Completing a yearly item creates the next one. For renewals, the next date comes again from the contract; if the contract or the confirmed date is gone, no next item is created.
  - The item's owner may close it even if the customer belongs to someone else.
- **Tasks**:
  - Items due within `app_settings.customer_service.lead_days` (default 14) create **one** `customer_service` task per customer and owner („Service: …“ or „N Serviceanlässe – …“). Overdue items make it high priority. The task closes when nothing is due any more.
  - Customer follow-ups now have their own task type `customer_follow_up`, so the two generators never close each other's tasks. Existing follow-up tasks are migrated.

**Frontend**
- `useServiceItems` hook; `ServiceCard` on the customer page:
  - Open items sorted by date, with overdue ones in red; buttons „Erledigt“ and „Absagen“.
  - New item form: for „Hauptfälligkeit“ you pick a contract that has a confirmed date, and the next date is previewed with its origin.
  - History of done and cancelled items.
- Task label „Kunde nachfassen“, notification setting for it, and a German error text.

## Tests
- pgTAP `220_service_reminders.test.sql` (19): anniversary golden cases; no renewal reminder without a confirmed date; the renewal date taken from the contract; owner limited to the structure; a date is required; one task per customer; overdue → high; lead time respected; yearly renewal → next year's item from the contract; occurrence chain; no double completion; the task closes; follow-up as a separate task type; visibility for peer and manager.
- Vitest `serviceDates.test.ts` (5).
- Totals: 674 pgTAP assertions (23 files), 353 unit tests, 51 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. Link a contract without dates and choose „Hauptfälligkeit“: it isn't offered. Link one with a confirmed renewal date: it is, with the next date shown.
2. Create „Unterlagen ausstehend“ dated yesterday, then run the generators: the adviser gets one high-priority task for this customer.
3. Mark the renewal item „Erledigt“: next year's item appears automatically.
4. Set a follow-up on the customer as well: it's a separate task („Kunde nachfassen“).

## Edge cases & decisions
- One task per customer and owner, not per item, to avoid flooding the list. The customer page shows the individual items.
- The lead time is one setting for all kinds. Per-kind lead times can come later if Profina wants them.
- Items of archived or erased customers create no tasks. They stay in the history.
- Only the yearly recurrence exists. Other rhythms (e.g. every 2 years) can be added without changing the model.
