# Phase 6 — Retention automation & analytics (`r1/p6-automation`)

| | |
|---|---|
| Branch | `r1/p6-automation` → merged into `feat/requirements1` |
| Slices | `email-templates`, `email-engine`, `advanced-analytics` |
| Status | Done (Gate E open; email sending **off**) |
| Date | 2026-10-30 |

## Summary
| Slice | Result | Details |
|---|---|---|
| email-templates | Versioned plain-text templates, whitelisted merge fields, **safe rendering** (escaped HTML, no header injection), live preview, **four-eyes approval**, immutable approved versions | [r1-p6-email-templates.md](r1-p6-email-templates.md) |
| email-engine | Kill switch (**off**), send window, daily limit; campaigns with four-eyes approval and a **pinned** template version; idempotent planner; **every attempt logged, suppressed ones with reason**; everything re-checked at send time; expiry; suppression list fed by bounces; test mail to yourself; provider-agnostic Edge Functions (OD-11) | [r1-p6-email-engine.md](r1-p6-email-engine.md) |
| advanced-analytics | Source performance per month with cost per lead and sale; trend prompts for leaders (with minimum data, worded as questions); optional auto-assignment by workload (off) | [r1-p6-advanced-analytics.md](r1-p6-advanced-analytics.md) |

## §14.6 acceptance (customer communications)
| Requirement | Where |
|---|---|
| A campaign respects opt-outs, suppression rules and the send window | `email_block_reason` (at planning **and** sending), `in_send_window`; pgTAP 250 |
| Every attempted automated send has a log entry, including suppressed messages | `email_send_log` with `suppression_reason`; pgTAP 250 |
| An authorised user can preview and test-send a template before activation | live preview + `rpc_preview_template`; `rpc_send_test_email` (only to yourself, works while switched off) |
| A global pause prevents future sends while preserving the history | `rpc_set_email_enabled(false)`; claims release no live mail; history kept; pgTAP 250 |

## Gate E (before switching email on)
- [ ] Email provider chosen (OD-11: EU hosting, data processing agreement), adapter added in `supabase/functions/send-emails/provider.ts`, webhook signature verified in `email-events`.
- [ ] Profina's privacy contact approved the legal bases per template (default: consent only) and the template texts.
- [ ] Suppression list imported (existing opt-outs / bounces, if any).
- [ ] Test mails checked with real templates (`EMAIL_PROVIDER=dryrun`, then the real provider on staging).
- [ ] Scheduler for `send-emails` set up with `EMAIL_CRON_SECRET`; `select app_private.schedule_email_jobs();` run once.
- [ ] Only then: an admin switches sending on (with a reason).

## Numbers at the end of the project phases
- **766 pgTAP assertions** in 27 files; **44 migrations** apply cleanly.
- **366 unit tests**.
- **58 shared golden IDs** (+7 GC-MERGE).
- Lint: 0 errors (5 old warnings). `next build` OK. CI green.

## Next
The complete review checklist is in [../CHECKLIST.md](../CHECKLIST.md): open decisions, gates, deployment steps, things to test by hand and the clean-up backlog.
