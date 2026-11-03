# Phase 6 — Verification findings

Manual test guide: [r1-p6-manual-guide.md](r1-p6-manual-guide.md) · round 2: [r1-p6-manual-guide-round2.md](r1-p6-manual-guide-round2.md).

## Automated checks (2026-11-03, branch `feat/requirements1` @ `b3f4523`, before the fixes)

| Check | Result |
|---|---|
| `npm run test:db -- 240 / 250 / 260` | 24 / 27 / 16 assertions passed |
| `npx vitest run src/domain/emailTemplate src/domain/signals src/views/dashboard` | 18 tests passed |

## API, dry-run and browser pass (2026-11-03)

**API** through the real RPCs as adviser, finance, compliance and admin, each with and without 2FA.
**Dry-run:** Edge Functions served locally with a scratch env file (`EMAIL_PROVIDER=dryrun`); sending was switched
on locally for the walkthrough and off again afterwards. **Browser:** Chrome as compliance (without and with 2FA),
plus Playwright screenshots at 1,470 px (light and dark) and 500 px. **Production CSV import:** re-tested with good
rows, every bad-row kind and 5,000 rows.

**Works as specified** (no finding):
- Access: the role matrix holds (advisers and finance get `forbidden`; compliance without 2FA gets `mfa_required`).
- Templates: `unknown_merge_field` and `invalid_template` are refused, and four-eyes holds (`cannot_approve_own`, `awaiting_review`).
- Rejections need a reason. Approval pins the template version on the campaign.
- Only admins can switch sending on.
- Planning is idempotent (second run plans 0/0). Every suppression reason is logged.
- `send-emails` returns 401 without the secret or with a wrong one.
- `email-events`:
  - 401 without the secret
  - `invalid_json` and `invalid_payload` for bad bodies
  - unknown message ids are acknowledged
  - a bounce lands on the block list
  - an oversized body gets 413
- The test mail is rate-limited after 10. Special characters are escaped in the preview.
- Production import: staging gives every row the correct key (`term_required`, `premium_must_be_positive`, `invalid_premium_period`, `duplicate_in_file`, `unknown_employee_no`, `unknown_category`, `invalid_value`, `production_date_in_future`, `source_id_required`). 5,000 rows stage in 0.6 s.

## Findings

Severity: high (wrong data / security / blocked flow), medium (misleading), low (polish).

| ID | Area | Steps | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|
| P6-01 | Template subject | Draft with subject `Hallo\r\nBcc: x@…` (API) | Refused; a subject is one line | Saved; `render_text` only flattened line breaks inside merge values, so an authored line break reached the mail header (header injection once a provider is connected) | high | fixed — `subject_line_break` on save, `render_text` + TS mirror flatten the final subject; pgTAP 290, e2e |
| P6-02 | Campaigns | Approve or resume a second birthday campaign | Refused | Both active; customers get two birthday mails (was a CHECKLIST 6.2 backlog item) | medium | fixed — `birthday_campaign_active` on approve/resume; pgTAP, e2e, vitest, checked in the browser |
| P6-03 | Raw DB errors | Duplicate template name, name 2 chars, no / unknown legal basis, subject / body length, unknown block reason, window `25:00` | German messages | Raw CHECK / unique / „date/time field value out of range“ errors → generic text | medium | fixed — `template_name_taken` (case- and space-insensitive), `template_name_length`, `template_bases_required`, `subject_length`, `body_length`, `suppression_reason_invalid`, `invalid_time`; pgTAP, e2e |
| P6-04 | Send window | Type `9:00`, `25:00` or `abc` | Time picker, clear message | Free-text fields; the button stayed disabled without a reason | medium | fixed — `TimeInput`, strict server format, inline reason („Das Fenster muss vor seinem Ende beginnen.“), „Verwerfen“; vitest, e2e |
| P6-05 | Kommunikation UX | Any campaign or template action | Toast on success, clear labels, guarded forms | No success toasts; hand-rolled text buttons; campaign „Abbrechen“ next to the dialog's „Abbrechen“; forms not using `Form` (double submit) | medium | fixed — kit `Button` / `ActionMenu` („Kampagne abbrechen…“, confirm button named after the action), toasts named after the action, `Form` everywhere; vitest |
| P6-06 | Send log | > 200 entries; filter by status | All reachable, readable | Capped at 200 without notice; filter only within those 200; raw „Grundlage consent“ and `last_error`; no customer shown | medium | fixed — filtered and paged in the database (`DataTable` server pages), K-number, German notes (error code as tooltip only); vitest |
| P6-07 | Block list | Block an address; block it again as bounce; > 500 entries | Reason chosen, shown in German, updated | Reason always „manual“, shown raw; re-blocking was silent and kept the old reason; list stopped at 500 | low | fixed — reason select, German labels, re-block updates reason and note, server search and pages; pgTAP, e2e |
| P6-08 | 2FA | Compliance without 2FA on Kommunikation | Write actions disabled | All buttons enabled; every click ended in `mfa_required` | medium | fixed — every write action disabled without 2FA; vitest, checked in the browser |
| P6-09 | `email-events` | Chunked body without `Content-Length` | 413 | Size checked only from the header, the body was read in full | low | fixed — body read with a hard 10 KB cap; checked with a chunked 20 KB request |
| P6-10 | `send-emails` | `rpc_report_email_result` fails | Counted, visible in the function log | Errors ignored | low | fixed — `unreported` count + log line (row id and error code only) |
| P6-11 | Customer card | Customer with > 50 automatic mails | Says so | Silently the newest 50 | low | fixed — „Die neuesten 50 von N Einträgen“ |
| P6-12 | CSV import | Old Excel export (Windows-1252) with umlauts | Umlauts kept | Decoded as UTF-8 only → „M�ller“ | medium | fixed — shared `decodeCsvBytes` (UTF-8, fallback Windows-1252) for the production and block-list imports; vitest, checked in the browser |
| P6-13 | Block-list import (Gate E) | Import existing opt-outs and bounces | CSV import | Not available | feature | built — `rpc_import_suppressions` (admin/compliance with 2FA, ≤ 10,000 rows, normalised, per-row reason or default, duplicates and existing blocks counted, errors by row number only, audited), dialog with template download and result table; pgTAP, vitest, e2e |

### Round 2 (browser re-test of the fixes)

| ID | Area | Actual | Severity | Status |
|---|---|---|---|---|
| P6-R2-01 | Import result | Error rows numbered by data row; in Excel the header is line 1, so „Zeile 2“ was line 3 | low | fixed — „Zeile in der Datei“ counts the header; vitest |
| P6-R2-02 | Send log layout | In the half-width column dates wrapped and the note column was cut off; customer shown as `2660` | low | fixed — full width, `K-02660` |
| P6-R2-04 | Birthday campaigns | Found while writing the round-2 guide: two approvals at the same moment could both pass the „one active“ check | medium | fixed — transaction lock around the check; e2e approves two in parallel |
| P6-R2-03 | Send log note | A bounce read „Fehler beim E-Mail-Anbieter“ | low | fixed — „Vom E-Mail-Anbieter als unzustellbar gemeldet; Adresse gesperrt“ |

### Notes (no change)
- **P6-NOTE-01** Production import accepts very large premiums (100,000,000 €). There's no business ceiling in the spec; decide with Profina whether a plausibility limit is wanted.
- **P6-NOTE-02** The e2e suite doesn't call the Edge Functions (they need a served function stack). The dry-run walkthrough in the manual guide covers them.

## Verification after the fixes (2026-11-03)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | OK, 0 errors (2 known warnings) |
| `npm test` | 61 files, 514 tests passed |
| `npm run check:golden` | OK (58 shared IDs) |
| `npm run test:db` | 30 / 30 files passed (290: 24 assertions) |
| `npx playwright test phase4 / phase5 / phase6` | 31 passed (phase 6: 8) |
| `npx next build` | OK |
| Dry-run after the fixes | `send-emails` → `{"sent":0,"failed":0,"unreported":0}` with sending off; chunked oversized webhook → 413 |
