# Phase 5 — Customer CRM (`r1/p5-crm`)

| | |
|---|---|
| Branch | `r1/p5-crm` → merged into `feat/requirements1` |
| Slices | `customers`, `consent`, `contract-links`, `service-reminders`, `privacy-ops` |
| Status | Done (Gate D still open: external review) |
| Date | 2026-10-29 |

## Summary
| Slice | Result | Details |
|---|---|---|
| customers | Central customer list. Adviser and structure visibility (OD-13), compliance read-only, no finance access. Adviser history with reason, duplicate warning, archive. **Lead → customer conversion** keeps the source. Customer activities and follow-ups. `/vertrieb/kunden`, `/vertrieb/kunden/[id]` | [r1-p5-customers.md](r1-p5-customers.md) |
| consent | Append-only consent log per purpose with legal basis, source and evidence; global opt-out. **`may_contact()`** as the single send-time check for Phase 6. Lead basis carried over on conversion | [r1-p5-consent.md](r1-p5-consent.md) |
| contract-links | Contracts with stable external ids (no duplicates). Policy dates **only** from the portal or confirmed from documents. Service-role sync intake with run and error log (**metadata only**). The portal itself is OD-14 | [r1-p5-contract-links.md](r1-p5-contract-links.md) |
| service-reminders | Reviews, documents, follow-ups after advice, renewals (from confirmed dates only), yearly recurrence. **One task per customer**; follow-ups have their own task type | [r1-p5-service-reminders.md](r1-p5-service-reminders.md) |
| privacy-ops | Data subject requests with a one-month deadline; logged export; **pseudonymising erasure** that keeps business records; retention report (OD-16); PII redacted from task titles in the audit log. `/vertrieb/kunden/datenschutz` | [r1-p5-privacy-ops.md](r1-p5-privacy-ops.md) |

## Gate D (before any live customer data)
| Condition | Status |
|---|---|
| RLS tests for every CRM table: adviser / manager / peer / finance / compliance / admin with and without MFA | ✅ pgTAP 190–230 |
| Audit of customer, consent, contract, service and privacy changes, with PII redacted | ✅ incl. "the audit log never contained the name" |
| Append-only consents, assignments and export log | ✅ |
| **External access review** (Profina's privacy contact) | ⏳ open: your side |
| OD-13 (visibility), OD-14 (portal), OD-16 (retention) decided | ⏳ open |

## Numbers at the end of the phase
- **699 pgTAP assertions** in 24 files; 41 migrations apply cleanly. The Phase 4 summary's „38 migrations“ was corrected to 36.
- **355 unit tests**.
- **51 shared golden IDs** (+4 GC-SERVICE).
- Lint: 0 errors (5 old warnings). `next build` OK.

## Still to do on your side
- Turn on the `customers` flag to test.
- Give compliance users the `compliance` role. They need MFA for the privacy actions.
- Gate D review, and answers to OD-13, OD-14 and OD-16.
- Contract portal (OD-14): which system it is and which export or API it offers. The adapter is a small Edge Function on top of `rpc_ingest_contracts`.

## Open items (for the clean-up branch)
- Production and other CSV exports should also go through a logging RPC (`export_log`).
- Customer import (CSV) through `rpc_create_customer`, with the duplicate check.
- An automatic reassignment queue for customers of deactivated advisers (tasks already move).
- A "missing in last sync" detection once the portal export format is known.
- Per-kind lead times for service items; more recurrence options.

## Next
Phase 6: `r1/p6-automation` (email templates with four-eyes approval, email engine behind the kill switch, advanced analytics), then Gate E.
