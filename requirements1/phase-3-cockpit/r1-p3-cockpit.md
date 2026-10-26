# Phase 3 — Management cockpit (`r1/p3-cockpit`)

| | |
|---|---|
| Branch | `r1/p3-cockpit` → merged into `feat/requirements1` |
| Slices | `goals`, `dashboards`, `career-progress`, `profiles-coaching`, `forecast` |
| Status | Done |
| Date | 2026-10-27 |

## Summary
| Slice | Result | Details |
|---|---|---|
| goals | Monthly goals, immutable submitted versions, manager approve/return with comment, nearest active manager as reviewer, `/vertrieb/ziele` | [r1-p3-goals.md](r1-p3-goals.md) |
| dashboards | `/vertrieb` with employee, team and admin sections; ledger-based totals (no double counting); data-quality list | [r1-p3-dashboards.md](r1-p3-dashboards.md) |
| career-progress | Career simulator on the shared rule engine: what-if, missing points/KV, structure headroom | [r1-p3-career-progress.md](r1-p3-career-progress.md) |
| profiles-coaching | Performance profile with prompts; coaching sessions, actions and notes; **private manager notes with strict visibility; none for finance/admin**; actions on the employee dashboard | [r1-p3-profiles-coaching.md](r1-p3-profiles-coaching.md) |
| forecast | Month-end and career projections, always labelled as estimates with their method | [r1-p3-forecast.md](r1-p3-forecast.md) |

## Numbers at the end of the phase
- **479 pgTAP assertions** in 15 files; 34 migrations apply cleanly
- **307 unit tests**
- 40 shared golden IDs (unchanged; Phase 3 adds no new rules, it reuses them)
- lint 0 errors; `next build` OK

## Fixed along the way
- Career simulator: added KV points weren't counted as points as well (caught by a test).
- Test runner: now refuses `\gset` lines with trailing comments, which had silently broken four test files during development.
- Vitest: placeholder Supabase env, so indirect imports of the client don't crash test files.

## Open items (for the clean-up branch with Profina's answers)
- Activity-based KPIs, prompts and forecast inputs need Phase 4 (activities, appointments, leads).
- Review notifications (goal waiting, overdue actions, next coaching review) need the task engine.
- Retention of coaching data (OD-16); configurable prompt thresholds.
- Finance/admin users without an employee record have no `/vertrieb` dashboard (they use the finance and admin pages).

## Next
Phase 4 — `r1/p4-leads-tasks`: task engine (first, shared by all modules), activities/appointments, leads with assignment/SLA/duplicates, lead analytics.
