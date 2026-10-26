# Phase 1 — Core foundation (`r1/p1-foundation`)

| | |
|---|---|
| Branch | `r1/p1-foundation` → merged into `feat/requirements1` |
| Slices | `audit`, `identity-roles`, `hierarchy`, `rules-config`, `production`, `career-engine` |
| Status | Done; CI green on GitHub (run 40330469736) |
| Date | 2026-10-26 |

## Summary
| Slice | Result | Details |
|---|---|---|
| audit | Append-only audit trail, generic change trigger (changed columns only, redaction, reason, correlation id) | [r1-p1-audit.md](r1-p1-audit.md) |
| identity-roles | Employees, **invite-gated signup** (replaces the allowlist), roles admin/finance/compliance, **MFA-gated admin RPCs**, invite Edge Function, `/admin/mitarbeiter`, `/profil/sicherheit` | [r1-p1-identity-roles.md](r1-p1-identity-roles.md) |
| hierarchy | Effective-dated reporting lines, future-aware cycle check, date-correct attribution (`ancestors_at`), structure visibility (6 ms at 5k employees), `/vertrieb/team`, `/admin/hierarchie` | [r1-p1-hierarchy.md](r1-p1-hierarchy.md) |
| rules-config | Versioned, immutable rules seeded from the spec; draft → publish with validation; level history; `/admin/regeln` | [r1-p1-rules-config.md](r1-p1-rules-config.md) |
| production | Production records, **ledger-style points** (original/reversal), single SQL engine + TS preview, staged CSV import, `/vertrieb/produktion` | [r1-p1-production.md](r1-p1-production.md) |
| career-engine | Career periods, on-demand qualification (KV minimum, 50 % structure cap, attribution on the production date), promotion approval with evidence, `/vertrieb/karriere`, `/admin/befoerderungen` (26 ms at 5k employees / 20k contracts) | [r1-p1-career-engine.md](r1-p1-career-engine.md) |

## Numbers at the end of the phase
- **304 pgTAP assertions** in 8 files; 25 migrations apply cleanly
- **246 unit tests** in 22 files
- **29 golden case IDs verified in both engines** (17 points, 5 periods, 7 qualification)
- `npm run lint`: 0 errors (the same 5 old warnings); `next build` OK

## Delivery gates (plan §8)
| Gate | Status |
|---|---|
| **B** — calculation tests green in both engines | ✅ **Met** for points, AE, periods, KV minimum and the structure cap. Reserve and differential belong to Phase 2. |
| **A** — Profina signs off the rules and answers OD-01…OD-08 | ⏳ Open. Every provisional rule is isolated in one function and shown in the UI with its OD id. |
| **D** — RLS/audit suite + external access review | Partly: the RLS/audit suite exists for all Phase 1 tables; the external review is still needed. |

## Production impact if `feat/requirements1` were deployed now
- **The signup changes**: only invited emails can create accounts. Existing accounts keep working (vault untouched) and are linked automatically when an admin creates an employee record with the same email.
- All sales modules remain hidden (feature flags off).
- Rollout runbook: [r1-p1-identity-roles.md → Production rollout](r1-p1-identity-roles.md#production-rollout-when-phase-1-passes-its-gate). Then set initial levels and run `rpc_generate_all_periods()`.
- Per the plan, this goes to `main` only after Gate A. **Nothing has been applied to the production database.**

## Open items carried forward
1. **Staging Supabase project.** Nothing signed-in has been clicked through yet. Every slice note lists its manual walkthrough.
2. **Gate A decisions**, especially OD-01…OD-04 (career), OD-06/07 (points), OD-08 (eligibility milestone), OD-15 (promotion approval).
3. **Edge Function deployment** (`invite-employee`): needs a working Supabase CLI or the dashboard.
4. **UI gaps noted in the slices:**
   - correction form for eligible production
   - leaders entering production for their team (business decision)
   - reassignment reminder when a manager is deactivated (task engine)
   - a full login ban on deactivation (if wanted)
5. **Data-quality checks** for the admin dashboard (Phase 3): employees without a level, without an assignment, or without periods.

## Next
Phase 2 — `r1/p2-commission` (rate matrix, ledger, statements, subsidy, finance UI). Per the plan it **starts after Gate A answers OD-05, OD-08 and OD-10.** Alternatively, `r1/p4/task-engine` can start now, since it only needs identity and hierarchy (plan §11).
