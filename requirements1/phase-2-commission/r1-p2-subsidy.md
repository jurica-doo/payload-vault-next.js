# r1/p2/subsidy — Approved monthly subsidies

| | |
|---|---|
| Branch | `r1/p2/subsidy` → merged into `r1/p2-commission` |
| Plan section | IMPLEMENTATION_PLAN.md §3.4, §6 Phase 2 · `r1/p2/subsidy`; spec §2 (subsidy handling), §6.3, §6.4 |
| Status | Done; 18 new pgTAP assertions (388 total) |
| Date | 2026-10-26 |

## What was done — `20261026230000_subsidy.sql`
| Object | Notes |
|---|---|
| `subsidy_records` | Per person and month: **ceiling snapshot** (level max at the start of the month), approved amount (≥ 0), coverage note (required), optional override reason, approver. Status `approved / superseded / revoked`; **one approved record per person and month**; changes supersede, so history is kept. DB CHECK: amount ≤ ceiling unless 0 or overridden. Audited. Visibility = commission visibility (own; finance/admin; leaders with OD-17). |
| `rpc_set_subsidy(emp, month, amount, note, reason, override?)` | Finance/admin + MFA + reason. Refuses `subsidy_above_maximum` without an override when the amount is above the ceiling, **the level has no standard maximum (FA)**, or **the employee is part-time** (§2: maxima are for full-time reps). Also refuses `period_locked` (approved/paid month), `before_start_date`, and `producer_without_level`. |
| `rpc_revoke_subsidy(emp, month, reason)` | Same checks. |
| `rpc_statement` | Now includes `subsidy {approved, max, note, override}` as a **separate line** (§6.3). Subsidy never creates points or AE. |
| `rpc_statement_overview` | Now also lists people with only a subsidy, and has a `subsidy` column. |

Not automated (OD-09): prorating, pausing, reclaiming, and the coverage formula. Finance records the amount it decided plus the reason.

## How to verify
```bash
npm run test:db -- 110
```

## What to look out for
- The ceiling snapshot uses the level **at the start of the month**. A promotion mid-month raises the ceiling only from the next month.
- An approved subsidy is a **recorded decision, not a payment**. Payment export/reconciliation is still open (§16).
- "Subsidy review due" alerts (§11.2) come with the task engine.

## Edge cases covered by tests
- employees can't grant subsidies
- stored on the 1st of the month with the FB ceiling (500) as a snapshot
- 600 for FB refused, then accepted with an override; one approved record, the previous one superseded
- FA (no standard maximum) needs an override; part-time needs an override; 0 is always allowed
- not before the start month; negative amounts refused
- approved month locked
- the statement shows the subsidy and flags the override; the overview lists people without commission
- a revoked subsidy disappears from the statement
- employees see only their own; changes audited
