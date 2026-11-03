# Phase 5 — Verification findings

Manual test guide: [r1-p5-manual-guide.md](r1-p5-manual-guide.md).

## Automated checks (2026-11-03, branch `feat/requirements1` @ `9ad8006`)

| Check | Result |
|---|---|
| `npm run test:db -- 190 / 200 / 210 / 220 / 230` | 29 / 22 / 22 / 19 / 25 assertions passed |
| `npx vitest run src/views/customers src/domain/consent.test.ts src/domain/serviceDates.test.ts` | 4 files, 14 tests passed |

## Browser + API pass (2026-11-03)

API through the real RPCs (`e2e/lib/api.mts`) as Ali, Anna, Tim, Ben, Tina, finance, compliance (with and
without 2FA) and admin (with and without 2FA); browser (Chrome) as Ali and compliance; volume test with
2,500 extra customers.

**Works as specified** (no finding): duplicate warning by phone and similar name, hidden for other
structures; unknown fields refused; empty texts stored as NULL; birth date in the future refused;
visibility (adviser, manager, ancestor, compliance read-only; peers, other structures and finance see
nothing); admin writes need 2FA; reassignment needs a reason and stays inside the structure; conversion
(won, linked both ways, consents copied „aus Lead“, only once, not from the pool); evidence required for
consent; back-dated grant doesn't revive a withdrawal; future consent refused; opt-out/opt-in; contract
duplicate number, unconfirmed dates, http/javascript links refused; sync intake service-role only, mixed
run with payload-free error codes; 29 Feb renewal → 28 Feb next year; one task per customer, overdue →
high, system task can't be ticked off (Phase 4 change works here); privacy requests: 2FA, lookup by number,
one-month deadline, access can't be closed by hand, export once, erasure removes the name from customer,
lead, tasks, notifications and audit while contracts stay; rate limit after 20 exports per hour.

## Findings

Severity: high (wrong data / access / blocked flow), medium (misleading), low (polish).

| ID | Area | Steps | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|
| P5-REG-01 | Customer follow-up | Detail → Nächstes Nachfassen → time `25:99` → Planen | Inline error / time picker | Uncaught `UserFacingError` (console), nothing saved, no message. Regression: Phase 4 made `berlinLocalToUtcIso` strict; this caller (`CustomerDetailPage.tsx:162`) converts outside its try and still uses a free-text time | high | fixed — TimeInput + conversion inside try; e2e |
| P5-PERF-01 | Customer list | 2,508 customers for Ali | All reachable | Only 1,000 arrive (PostgREST max rows; the hook asks for 2,000), sorted by last name, so everyone after the 1,000th is missing from list **and** search; no notice | high | fixed — server-side search, list columns, total + notice; vitest |
| P5-PRIV-01 | Privacy / consent | Compliance (2FA) records an opt-out for an „Widerspruch“ request | Compliance can carry out the objection | `rpc_record_consent` → forbidden; the ConsentCard is read-only for compliance, so an objection request can only be closed after asking the adviser | high | fixed — compliance (2FA) records opt-outs/withdrawals, „Widerspruch umsetzen“ (`rpc_apply_objection`); pgTAP 280, vitest, e2e |
| P5-UI-01 | Customer search | Search `0171 …` | Customer found | Nothing (`+49171…` works); same cause as P4-UI-02 (client-side raw compare) | medium | fixed — server search with `phoneSearchFragment`; e2e |
| P5-UI-02 | Raw codes | Contract without product, contract source, Profil „Quelle“, export log | German labels | Contract titled „LV“, „· manuell / · portal“, Quelle „portal · P-…“, export log „subject_access · customer“, phone `+491712327651` ungrouped | medium | fixed — category names, „aus Unterlagen / Vertragsportal“, export log labels, `formatPhone`; e2e |
| P5-API-01 | Error keys | Customer notes > 4,000; consent unknown purpose; consent `withdrawn` with a legal basis; contract end before start; service title „ab“ | Named keys with German text | Raw CHECK violations (`customers_notes_check`, `customer_consents_purpose_check`, `consent_action_fits`, `contract_dates_order`, `customer_service_items_title_check`) → generic message | medium | fixed — `text_too_long`, `invalid_postal_code`, `consent_invalid`, `contract_dates_order`, `title_too_short`; pgTAP 200/210/280, e2e |
| P5-API-02 | Service items | Renewal item without contract | `renewal_date_unconfirmed` | `not_found` („nicht gefunden“) | low | fixed — `renewal_date_unconfirmed`; pgTAP 280, e2e |
| P5-UX-01 | Consent | „Widerspruch: keine Kontaktaufnahme“ | Confirmation dialog with source/note | One click, uses whatever source/evidence is in the grant form; no toast | medium | fixed — confirmation dialog with source and note; vitest, e2e |
| P5-UX-02 | Privacy page | Open requests list | Subject number visible, lead link | „DS-n · Auskunft · Kunde · öffnen“ only; lead subjects have no link; export log has no person/request | medium | fixed — `privacy_requests.subject_no`, K-/L-number in rows, DS-number in export log; pgTAP 280, e2e |
| P5-UX-03 | Customer detail | Admin without 2FA | MFA notice, actions disabled | Forms and buttons enabled; every save fails with the 2FA error | medium | fixed — MFA notice, actions off for admins outside the structure without 2FA (`managesEmployee`); vitest |
| P5-UX-04 | Consistency | Create/edit/archive/reassign customer, consent, contract, service item, privacy actions | Success toasts, kit buttons, reason counters | No success toasts; hand-rolled text buttons (Bearbeiten, Archivieren, Verknüpfen, Entfernen, Erledigt, Absagen, privacy actions); reassignment reason without counter | medium | fixed — toasts for every save, kit buttons, reason counter |
| P5-UX-05 | Follow-up date | Plan in the past (UI and API) | Not allowed / warned | Accepted → immediately overdue task | medium | fixed — date picker from today, `date_in_past` in create/update RPCs; pgTAP 280, e2e |
| P5-UX-06 | Contract form | „Quelle der Nummer: Vertragsportal“ | Manual entries are manual | Saved as source `portal`, shows „portal“ but stays editable/removable; mixes manual data into the portal namespace | medium | fixed — source option removed, `manual_source_only`; pgTAP 210/280, e2e |
| P5-UX-07 | Service items | Erledigt / Absagen | Note optional, cancel confirmed | One click, no note, no undo; the form's note field never renders (`note` state unused) | medium | fixed — dialog with optional note for Erledigt/Absagen, note field in the form |
| P5-UX-08 | Contract form | End before start; edit a manual contract | Inline validation; edit | Raw error after submit; no edit for manual contracts (only remove + relink) | low | fixed — inline date order check, edit for manual contracts |
| P5-UX-09 | Customer list | Tabs, search field | Counters, kit SearchBar, empty-search message | No counters; plain input; „Keine Kunden in dieser Ansicht“ also for a miss | low | fixed — counters, kit SearchBar, empty-search message; vitest |
| P5-UX-10 | Privacy | Open another request for an erased customer | decide | Allowed (export would return the pseudonymised record) | low | fixed — allowed, with „bereits pseudonymisiert“ hint |

## Fixes (2026-11-03)

All 17 findings are fixed. Database changes: `supabase/migrations/20261101110000_phase5_review_fixes.sql`;
regression tests: `supabase/tests/280_phase5_review_fixes.test.sql` (19 assertions), `e2e/tests/phase5-crm.spec.ts`
(8 tests) and vitest next to the changed views (titled with the IDs). Tests 200, 210 and 230 were adjusted to the
new keys and the future-only follow-up. The e2e fill now enrols 2FA for compliance@test.com.

Decisions taken with the user: compliance may record opt-outs and withdrawals (never grants) and carries out an
objection in one step; manual contract links are always „aus Unterlagen“; follow-ups can't be planned in the past
(form and database); requests for an already pseudonymised customer stay possible, with a hint.

## Round 2

Guide: [r1-p5-manual-guide-round2.md](r1-p5-manual-guide-round2.md). New findings get IDs P5-R2-xx.

Browser pass 2026-11-03 (Chrome, 500 px light, keyboard), as Ali and compliance with 2FA.
Works: objection dialog as bottom sheet, Escape closes, focus returns; contract form without portal source,
inline date-order error, end date limited by the start date, edit/remove only on manual contracts; privacy request
via the form shows „Kunde K-00136“; „Widerspruch umsetzen“ records the opt-out (evidence „Datenschutzanfrage DS-29“)
and completes the request, with confirmation dialog and toast.

| ID | Area | Steps | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|
| P5-R2-01 | Customer forms | Double-click any save button | One record | Not re-tested separately; same kit Button as P4-R2-01, so customer, consent, contract and service forms are expected to double-submit too | high | fixed — same kit fix as P4-R2-01; re-tested: two clicks in the same instant → one customer |
| P5-R2-02 | Consent card | 500 px | Readable table and form | „Feiertagsgrüße–“ without gap, „Werbe-E-Mails“ broken; selects in the form have uneven widths | low | fixed — cell spacing, no hyphenation of purposes, form fields in an equal-width grid |
| P5-R2-03 | Objection dialog | Open with the keyboard | Focus on the first field | Focus lands on „Notiz“, skipping „Wie wurde das mitgeteilt?“ | low | fixed — modal focuses the first field including kit dropdowns (`role=combobox`) |
