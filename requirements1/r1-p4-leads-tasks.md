# Phase 4 — Leads & tasks (`r1/p4-leads-tasks`)

| | |
|---|---|
| Branch | `r1/p4-leads-tasks` → merged into `feat/requirements1` |
| Slices | `task-engine`, `activities`, `leads`, `lead-analytics` |
| Status | Done |
| Date | 2026-10-28 |

## Summary
| Slice | Result | Details |
|---|---|---|
| task-engine | One task list for every module, plus system generators (goal review, coaching, career period end, calculation exceptions, reassignment of inactive owners). In-app notifications; critical kinds can't be muted. pg_cron when enabled. `/vertrieb/aufgaben` | [r1-p4-task-engine.md](r1-p4-task-engine.md) |
| activities | One activity log (contact attempts, calls, emails, appointments, offers, follow-ups, notes) with appointment outcomes, shared funnel definitions in SQL, a reusable `ActivityPanel`, `/vertrieb/aufgaben/aktivitaeten`, and dashboard tiles against the goal | [r1-p4-activities.md](r1-p4-activities.md) |
| leads | Configurable pipeline with required fields per stage. Assignment and reassignment with reason and history, and a pool for leaders. First-contact SLA in **business hours** (holidays, DST; TS mirror with golden cases). Duplicate warning before create, and audited merge. Activities move leads forward automatically. Three lead task generators with manager escalation. `/vertrieb/leads`, `/vertrieb/leads/[id]`, `/admin/leads` | [r1-p4-leads.md](r1-p4-leads.md) |
| lead-analytics | Cohort funnel that never increases, four rates with visible denominators, time to first contact, sources with points/commission/cost per lead and sale (organisation view only), per person, loss reasons. `/vertrieb/leads/analyse` | [r1-p4-lead-analytics.md](r1-p4-lead-analytics.md) |

## §14.5 acceptance (lead workflows)
| Requirement | Where |
|---|---|
| A manager can assign a lead and the audit trail records who and when | `rpc_assign_lead` → `lead_assignments` (append-only) + audit event with reason; pgTAP 170 |
| Overdue lead follow-up appears in the owner's task list and the manager's authorised overview | `lead_first_contact` / `lead_next_action` tasks for the owner; managers see their structure's tasks and get `lead_sla_breach`; pgTAP 170 |
| A converted lead stays linked to its source and subsequent production | `leads.source_id` + `production_id` (owner-checked); points and commission by source in the analytics. `customer_id` is reserved for Phase 5 |
| Dashboard actuals from validated records without double counting | Activity counts come from one SQL definition (`rpc_activity_summary`); production stays ledger-based (Phase 3) |

## Numbers at the end of the phase
- **582 pgTAP assertions** in 19 files; 36 migrations apply cleanly.
  - These totals were recounted from each file's `plan()`. The Phase 3 note says 479, but the correct figure is **461**, and the per-slice notes in this phase now use the corrected running totals.
- **341 unit tests** in 37 files.
- **47 shared golden IDs** (+7 GC-SLA).
- Lint: 0 errors (5 old warnings in untouched components). `next build` OK.

## New open decision
- **OD-19**: lead SLA value, working day and holiday region.
  - Provisional: 8 business hours, Mon–Fri 09:00–17:00, nationwide holidays, counted from receipt.
  - An admin can set it at `/admin/leads`; saving it removes the "provisional" notice.

## Still to do on your side
- Turn on the `leads` and `tasks` feature flags (`app_settings.feature_flags`) when you want to test them.
- Enable pg_cron and run `select app_private.schedule_jobs();` once. Until then, admins run the generators from the tasks page.
- Bundesland holidays: add rows in `/admin/leads` once Profina's region is known.

## Open items (for the clean-up branch)
- CSV import of leads (reuse the production import wizard, with every row going through `rpc_create_lead`).
- Rescheduling an appointment could create the follow-up appointment automatically; today it's two steps.
- Lead → customer conversion (`customer_id`) and consent handling arrive with Phase 5.
- Analytics attribute to the current owner; switch to the owner at receipt if Profina prefers (the assignment history already exists).
- UX pass (by the user's decision): wording, empty states, mobile layout of the admin stage matrix.

## Next
Phase 5: `r1/p5-crm` (customers, consent, contract-links, service-reminders, privacy-ops), then Gate D before any live customer data.
