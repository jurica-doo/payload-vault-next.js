# r1/p5/consent — consents, legal basis, opt-out

Branch `r1/p5/consent` → merged into `r1/p5-crm`.
Spec: §10.1 (consent/permission records, opt-out status), §10.5, §12.3 (customer consent in the audit trail), §14.6 (preparation).

## What was built

**Database** — `supabase/migrations/20261029110000_consent.sql`
- `customer_consents`: an **append-only event log**. Mistakes are corrected with a new entry and never edited (the trigger blocks UPDATE and DELETE).
  - **Purposes**: Anruf, E-Mail (Service), WhatsApp, Werbe-E-Mails, Geburtstagsgrüße, Feiertagsgrüße.
  - **Actions**: `granted`, which needs a legal basis (Einwilligung / Vertrag / berechtigtes Interesse / rechtliche Pflicht), or `withdrawn`.
  - **Global switch** (purpose `all`): `opt_out` / `opt_in`. An opt-out overrides every consent.
  - **Each entry** records its source (form, phone, email, in person, letter, portal, import, lead), evidence (required for basis „Einwilligung“), when it takes effect (not in the future; back-dating allowed) and who recorded it.
- **Current state** = the latest entry per purpose **by effective time**, not by entry order. A back-dated old grant entered after a withdrawal therefore doesn't revive the consent. It's available as the view `v_customer_consent_state` (security invoker, so customer RLS applies).
- **`app_private.may_contact(customer, purpose)`**: the single send-time check. Phase 6 and anything else that sends must call it. It returns `{allowed, reason, legal_basis}` and checks in this order:
  1. The customer exists and isn't erased.
  2. The customer isn't archived or a former customer.
  3. No opt-out.
  4. Address or number present (and a birth date for birthday mail).
  5. Current entry is `granted`.
- `rpc_may_contact` is the same check for the UI, limited to customers you may see.
- `rpc_record_consent(...)`: adviser, managers, or admins (MFA). Audited, with the evidence redacted in the audit log.
- **Lead conversion** copies the lead's recorded basis as „Anruf“ and „E-Mail (Service)“ consents, with source „aus Lead“ (trigger on `leads.customer_id`).
- `rpc_consent_report()` (compliance and admin): active customers, opt-outs, granted/withdrawn per purpose, withdrawals in the last 30 days. It's shown on the privacy page in the privacy-ops slice.
- Visibility follows the customer: adviser, managers, admin and compliance (read).

**Frontend**
- `src/domain/consent.ts`: labels, `currentState()` and `mayContact()`, which mirror the SQL logic for display.
- `ConsentCard` on the customer page:
  - One row per purpose with its state and „Kontakt erlaubt?“ including the reason (e.g. „keine Rechtsgrundlage erfasst“, „widerrufen“, „kein Geburtsdatum hinterlegt“).
  - A form to record an entry; evidence is required for an Einwilligung.
  - A one-click „Widerspruch: keine Kontaktaufnahme“ and its reversal, and the full history.
- Error text for `consent_evidence_required`.

## Tests
- pgTAP `200_consent.test.sql` (22): no basis → no contact; birth date needed; evidence and basis required; no future dates; grant → allowed with basis; withdrawal wins; history kept; current-state view; **back-dated grant doesn't override a newer withdrawal**; opt-out overrides and opt-in restores; append-only; peers can neither check nor record; compliance reads and gets the report; lead conversion keeps the basis.
- Vitest `consent.test.ts` (4): the same rules on the TS side.
- Totals: 633 pgTAP assertions (21 files), 348 unit tests, 47 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. On a new customer every purpose shows „keine Rechtsgrundlage erfasst“.
2. Record „Werbe-E-Mails – erteilt – Einwilligung“ without evidence: the button stays disabled (the API refuses too). Add evidence: the purpose shows „erlaubt“.
3. Record a withdrawal, then a back-dated grant: it stays „widerrufen“.
4. Click „Widerspruch“: everything becomes „Widerspruch gegen jede Kontaktaufnahme“. Lift it: the earlier states return.
5. Convert a lead that has a recorded legal basis: the new customer has Anruf and E-Mail allowed, with source „aus Lead“.

## Edge cases & decisions
- **Which basis is valid for which purpose is not judged by the system.** It records what the adviser states. Whether e.g. birthday mails may rely on „berechtigtes Interesse“ is for Profina's privacy contact to decide (§10.5). Phase 6 can restrict allowed bases per template.
- Opt-out is global. Purpose-specific objections are recorded as a withdrawal of that purpose.
- A future-dated withdrawal is not possible (effective time ≤ now). Planned changes are recorded when they happen.
- Erasure (privacy-ops) keeps consent events but strips their evidence text, because the proof of permission and of withdrawal must survive.
