# r1/p1/career-engine — Career periods, qualification, promotions

| | |
|---|---|
| Branch | `r1/p1/career-engine` → merged into `r1/p1-foundation` |
| Plan section | IMPLEMENTATION_PLAN.md §3.3, §6 Phase 1 · `r1/p1/career-engine`; spec §4, §7.4, §14.4 |
| Status | Done; 51 new pgTAP assertions (304 total), 246 unit tests, **29 shared golden IDs**, 26 ms for 5k employees / 20k contracts |
| Date | 2026-10-26 |

## What was done

### Database — `20261026190000_career_engine.sql`
| Object | Notes |
|---|---|
| `career_periods` | Stored per employee (§4.2), no overlaps (exclusion constraint), RLS = employee visibility. Generated idempotently up to the period containing today. Regenerated if the employee's start date changes. |
| `app_private.period_plan(start, until)` | `first_personal` = [start, start + 1 year), where **29 Feb ends on 1 Mar**; `transition` = [end of first year, next 1 Jan), **skipped when the first year ends on 1 Jan**; then `calendar` years. |
| `app_private.apply_career_rules(…)` | **Pure rule function** (mirrored in `src/domain/qualification.ts`). Personal points uncapped. With a cap ratio, each structure counts at most threshold × ratio. A capped structure keeps its KV **proportionally** (OD-03). Negative nets count as 0. Ready iff eligible ≥ threshold **and** eligible KV ≥ threshold × 10 %. |
| `app_private.structure_roots_at(leader, date)` | Every descendant with the direct report whose subtree it belongs to ("structure" = direct report's subtree, OD-04). |
| `app_private.compute_qualification(emp, date)` | Counting window = current period, **but not before the current level's effective date** (promotion mid-period → restart, no carry-over, OD-02). Points = SUM of the **ledger** (eligible calculations incl. reversals) for production dated in the window. Structure production is **attributed with the hierarchy on the production date**: the window is split into segments at assignment boundaries, membership is resolved once per segment, then contracts are joined. Returns personal points, per-structure gross/eligible/KV with a cap flag and names, totals, missing points/KV, ready flag, target, period, window, and a linear pace estimate (`expected_now`). |
| `rpc_career_progress(emp?)` | Own progress (no argument), or anyone the caller may see (structure, admin/finance/compliance). Blocked states are explicit: `no_level`, `no_period`, `no_rules_for_date`; `top_level` for VD. **Never guesses** (§16). |
| `rpc_promotion_queue()` | Admin + MFA: everyone who is ready today. |
| `rpc_approve_promotion(emp, reason)` | Admin + MFA + reason. **Recomputes at approval time**; refuses `not_qualified` and `level_changed_today`. Writes `career_level_history` with `source = promotion` and the **full calculation as evidence**. One level at a time; the engine never lowers a level (§4.3). |
| `rpc_generate_all_periods()` | Admin, e.g. right after rollout. |

**Deviation from the plan (deliberate):** no `career_credits` / `qualification_status` snapshot tables and no nightly job. All inputs (ledger, dated hierarchy, level history, rules) are already stored and immutable or effective-dated, so computing on demand is exact, never stale, and corrections and cancellations show up immediately. The calculation is frozen only where it matters: as promotion evidence. Measured at 5,000 employees in a 6-level tree with 20,000 eligible contracts, the top leader's progress through RLS takes **~26 ms**. A first version with a recursive walk per contract took ~530 ms; the segment approach replaced it.

### Golden cases
| ID | Case | Expected |
|---|---|---|
| GC-PERIOD-001 | start 1 Nov 2026 (spec example) | personal year → transition Nov–Dec 2027 → calendar 2028 |
| GC-PERIOD-002 | start 1 Jan 2026 | no transition |
| GC-PERIOD-003 | start 29 Feb 2028 | first year ends 1 Mar 2029 |
| GC-PERIOD-004 | start 31 Dec 2026 | one-day transition (31 Dec 2027) |
| GC-PERIOD-005 | future start | only the first period |
| GC-CAREER-001 | FB: 100 P, 7 KV (§14.4) | not ready, 3 KV missing |
| GC-CAREER-002 | FB: 100 P, 10 KV (§14.4) | ready |
| GC-CAREER-003 | OL: one structure 800 P (§14.4) | 375 credited |
| GC-CAREER-004 | OL: personal 100, A 800/80 KV, B 300/40 KV | 775 P, 77.5 KV (A's KV × 375/800), ready |
| GC-CAREER-005 | TL target (no cap), structure 800 | 800 |
| GC-CAREER-006 | negative nets | 0 |
| GC-CAREER-007 | structure exactly at the cap | 375, not flagged as capped |

### Frontend
| Path | What |
|---|---|
| `/vertrieb/karriere` | Current → target level, status badge ("Qualifiziert – Freigabe ausstehend" / "In Arbeit"). Period type and dates with an **inclusive last day** (the DB stores exclusive ends). A "gezählt ab …" note after a level change. Progress meters for points (cap marker, pace line) and KV. "Herkunft der Punkte" table: own production plus each structure with produced/credited/KV credited and a "begrenzt" badge. Notices for OD-02 and, when a cap applies, OD-03/OD-04. Leaders/admins can pick a person from their structure. Blocked states are explained instead of showing zeros. |
| `/admin/befoerderungen` | Ready queue (needs MFA to load) and "Freigeben" with a reason. The text explains that points restart. |
| `src/domain/careerPeriods.ts`, `qualification.ts` | TS mirrors for the career simulator (Phase 3). |

## How to verify
```bash
npm run test:db -- 070
npm test
npm run check:golden      # 29 shared IDs
```
On staging:
1. Build DL → TL → FB → FA and set levels.
2. As FA: enter Sach 18,600 € net (93 P) and KV 196 €/month (7 P); finance confirms both. `/vertrieb/karriere` shows 100/100 P, 7/10 KV, "In Arbeit".
3. Add KV 84 €: "Qualifiziert"; the person appears in `/admin/befoerderungen`.
4. Approve: level FB, and the page restarts at 0 towards TL.
5. As TL with 800 P from one structure: 375 credited, "begrenzt".

## What to look out for
- **All four career rules are provisional** (OD-01…OD-04, OD-15). The code isolates each in one place:
  - period boundaries → `period_plan`
  - restart after promotion → the window in `compute_qualification`
  - cap and KV share → `apply_career_rules`
  - "what is a structure" → `structure_roots_at`
  - approval → `rpc_approve_promotion`

  Changing one rule means changing one function plus its golden cases on both sides.
- **"Ready" isn't stored.** If production is cancelled after someone appears in the queue, they drop out on the next load, and approval re-checks anyway.
- **Promotion evidence is the record of truth** for why someone was promoted. It's never recalculated.
- **Partial-year transition periods** count like any other period: a candidate has only the transition months to reach the target, then points reset on 1 January. That follows the spec's wording, but Profina must confirm it (§16 "Career-year transition").
- **Changing an employee's start date** regenerates their periods, which changes their current window. Do it before production is entered, or expect the progress numbers to move.
- **The promotion queue loops over all active employees** (~5 ms each at the measured size). Fine for hundreds; for thousands, move it to a cached nightly list.
- **Notifications** ("period ending soon", "ready for promotion") belong to the task engine (Phase 4).

## Edge cases covered by tests
**Periods**: the five golden cases; periods can't overlap; generated up to today only; a start date change regenerates them.

**Rules**: the seven golden cases; exactly-at-cap isn't flagged; ordering by size; cap value and missing points.

**Scenarios on real data**
- §14.4 FB candidate: 100 P / 7 KV → not ready, approval refused; +3 KV → ready, in the queue
- approval needs MFA; promoted to FB effective today with evidence stored
- next target TL; points restart at 0; no double promotion
- §4.5: FA's 800 P count 375 for TL (in FB's structure, flagged), the full 800 for FB (target TL, no cap), and appear in TL's structure for DL
- **transfer**: after FB moves to TL2, new production counts for TL2 and not TL, while earlier production stays with TL
- **cancellation**: a cancelled contract stops counting immediately

**Blocked / visibility**
- no level → `no_level`; VD → `top_level`
- own progress without an argument
- FA can't see TL's progress; TL2 can see FA's
- the queue is admin-only; employees see only their own periods

**Frontend**
- target/period/inclusive last day/"gezählt ab"
- capped structure badge and numbers
- OD notices
- blocked state without progress bars
- top level
