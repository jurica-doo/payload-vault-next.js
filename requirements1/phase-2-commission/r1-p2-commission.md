# Phase 2 — Commission engine (`r1/p2-commission`)

| | |
|---|---|
| Branch | `r1/p2-commission` → merged into `feat/requirements1` |
| Slices | `rate-matrix`, `ledger`, `statements`, `subsidy`, `finance-ui` |
| Status | Done; CI green on GitHub (run 40333818707) |
| Date | 2026-10-26 |

## ⚠ Started before Gate A
The plan starts Phase 2 after Profina answers **OD-05** (differential matrix), **OD-08** (eligibility milestone) and **OD-10** (reserve release/clawback). It was built on request with **provisional rules**:
- each provisional rule lives in one function per engine
- each is covered by golden cases
- each is shown in the UI with its OD id

**Commission must not be shown to users in production before Gate A and Gate C** (≥ 10 real cases reconciled against Profina's manual calculation).

## Summary
| Slice | Result | Details |
|---|---|---|
| rate-matrix | Pure commission rule (personal + **rate-compression differential**, 2 dp half-up, reserve as its own component), TS mirror, **reserve ratio versioned** with the level rules | [r1-p2-rate-matrix.md](r1-p2-rate-matrix.md) |
| ledger | **Append-only ledger booked in the same transaction as points**, hierarchy/levels/rates **on the production date**, exact reversals, bookings skip closed months, **exception queue instead of guessing**, OD-17 visibility | [r1-p2-ledger.md](r1-p2-ledger.md) |
| statements | Month workflow open → reviewed → approved → paid (approved/paid final, no approval before month end), per-person statement with separate buckets, finance overview, audited exports | [r1-p2-statements.md](r1-p2-statements.md) |
| subsidy | Approved subsidies with ceiling snapshot; override required above the ceiling, for FA, and for part-time; locked months; separate statement line | [r1-p2-subsidy.md](r1-p2-subsidy.md) |
| finance-ui | `/vertrieb/provisionen` (own statement) and `/vertrieb/provisionen/abrechnung` (finance workspace) | [r1-p2-finance-ui.md](r1-p2-finance-ui.md) |

## Numbers at the end of the phase
- **388 pgTAP assertions** in 12 files; 29 migrations apply cleanly
- **269 unit tests**
- **40 golden case IDs verified in both engines** (17 points, 5 periods, 7 qualification, 11 commission)
- lint 0 errors; `next build` OK

## Gates
| Gate | Status |
|---|---|
| B — calculation tests in both engines | ✅ now also for reserve and differential (§14.2: 560/56/504 and 280/28/252; §5.3 chain 280/140/420) |
| A — rules confirmed by Profina | ⏳ OD-05, OD-08, OD-10, OD-17 open (plus the Phase 1 ODs) |
| C — ≥ 10 real cases reconciled | ⏳ needs staging + real anonymised data |

## Bugs found and fixed during this phase
- **The ledger view hid a leader's own commission** once the producer had left the structure (production RLS applied through the view). The view now runs with owner rights and filters explicitly with the ledger's visibility rule, and a test proves it shows nothing more.
- **The CSV export would have turned negative reversal amounts into text** (formula guard on a leading `-`). Our own numbers are now written raw.

## Open items carried forward
1. Gate A answers (see above) and Gate C reconciliation.
2. Reserve release / clawback rows (OD-10), payment export to payroll (§16).
3. Leader team-statement page (only if OD-17 is switched on).
4. Staging walkthrough of all slice notes (still no staging project).

## Next
Per plan §11: `r1/p4/task-engine` (shared tasks/notifications, needed by Phase 3 alerts) and Phase 3 (`r1/p3-cockpit`: goals, dashboards, career simulator, coaching, forecast).
