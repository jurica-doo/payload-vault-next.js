# r1/p5/privacy-ops — data subject requests, export, erasure, retention

Branch `r1/p5/privacy-ops` → merged into `r1/p5-crm`.
Spec: §12.4 (export records, correction/access/deletion requests, retention), §10.5, §12.2 (protected exports, no casual deletion).

## What was built

**Database** — `supabase/migrations/20261029140000_privacy_ops.sql`

| Object | Purpose |
|---|---|
| `privacy_requests` | Every request from a data subject: Auskunft (access), Berichtigung (rectification), Löschung (erasure), Widerspruch (objection). Each records customer or lead, date received, channel, **due date = received + 1 month** (Art. 12(3) GDPR), status and outcome. Numbered `DS-n`. |
| `export_log` | **Append-only.** Every personal-data export with who, when, subject, number of records and request. |
| `rpc_find_privacy_subject(type, number)` | Finds a customer or lead by its K- or L-number. Compliance can't read leads otherwise, so only the id and status come back. |
| `rpc_open_privacy_request` / `rpc_close_privacy_request` | Open a request; close rectification and objection requests with an outcome, or reject any request with a reason. Access and erasure requests can **only** be completed by doing them (`use_dedicated_action`). |
| `rpc_export_subject_data(request)` | Needs an open **access** request. Returns everything stored about the subject as JSON. Rate-limited to 20 per hour per user, written to `export_log`, and completes the request. |
| `rpc_erase_subject(request)` | Needs an open **erasure** request. Pseudonymises (details below) and completes the request. |
| `rpc_retention_candidates()` | **Report only.** Retention periods are OD-16 and `app_settings.retention` is empty, so it returns nothing and deletes nothing. Once set, it lists former or archived customers with no active contract and no change for N years, and closed, unconverted leads. |

**What the export contains.** For a customer: the profile, adviser history, consents, contracts, service items, activities (including those from its lead time) and the original lead. For a lead: the lead with its stage and assignment history and its activities.

**Who:** compliance or admin, **always with MFA**.

**What erasure removes and keeps**

| | Customer | Its lead |
|---|---|---|
| Removed | Name, company, preferred name, birth date, phone, email, address, notes, follow-up, external id. Status becomes „ehemalig“ and the customer is archived. | Name, contact, campaign, referral, region, notes, next step. The name becomes „Gelöscht (Datenschutz)“. |
| Also removed | Activity notes, consent **evidence**, service item titles and notes, task titles and descriptions, notification texts | Same for its activities and tasks |
| Kept | Contract links, production, commission, the consent events themselves (proof of permission and withdrawal), and the stage and assignment history (workflow data) | |

Open tasks and service items are cancelled.

**Hardening along the way**
- Consents are still immutable. The only exception is that an erasure may set their evidence to null, which the trigger checks.
- **Task titles, descriptions and completion notes, and service item titles, are now redacted in the audit log** (they contain names). The test confirms that the audit log never contained the erased name.

**Frontend**
- `/vertrieb/kunden/datenschutz` (compliance and admin; linked as „Datenschutz“ from the customer list):
  - New request form: type, customer or lead number, channel, date received.
  - Open requests show their deadline, in red when overdue. Actions: „Daten exportieren“ (downloads a JSON file), „Pseudonymisieren“ (only after typing `LÖSCHEN`; the dialog says exactly what is removed and what is kept), „Abschließen“ and „Ablehnen“ (with outcome or reason).
  - Consent overview per purpose (from the consent slice).
  - Retention section: an OD-16 notice while no periods are set.
  - Export log; contract sync runs (admins).
- `usePrivacy` hook, `parseRecordNo()` with tests, German error texts.

## Tests
- pgTAP `230_privacy_ops.test.sql` (25):
  - **Permissions and lookup**: advisers are refused; compliance needs MFA; lookup by number (lead → its customer); the subject must exist; a one-month due date.
  - **Access**: an access request can't erase. The export contains profile, consents, contracts, activities and lead; it completes the request and is logged, and can't be repeated.
  - **Erasure**: it can't be closed by hand. Customer and lead are pseudonymised; activity notes and consent evidence are removed while consent events are kept; no name is left in tasks or service items; the contract stays.
  - **Audit and retention**: the audit log never contained the name; consents stay immutable outside an erasure; retention isn't configured, so there are no candidates.
- Vitest `PrivacyPage.test.ts` (2).
- Totals: **699 pgTAP assertions** (24 files), 355 unit tests, 51 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. As compliance **with MFA**: open an „Auskunft“ for a K-number, then click „Daten exportieren“. A JSON file downloads, the request is completed, and the export log has an entry.
2. Open a „Löschung“, then „Pseudonymisieren“; the button only works after typing `LÖSCHEN`. The customer shows „Gelöscht (pseudonymisiert)“, the contracts are still there, and the adviser's tasks for that customer read „Gelöscht (Datenschutz)“.
3. Without MFA every action is refused, and the page shows the MFA notice.
4. A request older than a month shows its deadline in red.

## Edge cases & decisions
- **Pseudonymise, not delete.** Contracts, production and commission must stay (insurance and commercial record-keeping), so the person is removed from them instead. Whether that is enough for each data class is for Profina's privacy contact (§12.4), together with OD-16.
- **The audit log is never rewritten.** Customer and lead PII has been redacted there from the start, and task titles from this slice on. The system isn't in production yet, so no older task audit rows with names exist.
- **Leads in the duplicate check**: an erased lead is named „Gelöscht (Datenschutz)“ and won't match real names.
- **Rectification** is done in the normal edit screens (audited), and the request is then closed with what changed. **Objection** to contact is recorded as a consent opt-out, then the request is closed.
- **Exports of other data** (e.g. production CSV) still happen in the browser and aren't in `export_log` yet. Routing them through a logging RPC is noted for the clean-up branch.
- Compliance users need an MFA factor. The MFA enrolment page (`/profil/sicherheit`) works for every user.
