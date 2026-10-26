# r1/p2/rate-matrix — Commission rules

| | |
|---|---|
| Branch | `r1/p2/rate-matrix` → merged into `r1/p2-commission` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 2 · `r1/p2/rate-matrix`; spec §5.2, §5.3, §6.1, §17.3–17.4 |
| Status | Done; 12 new pgTAP assertions, 13 new unit tests, **40 shared golden IDs** in total |
| Date | 2026-10-26 |

## Gate A note
The plan starts Phase 2 after Gate A (OD-05, OD-08, OD-10). It was started on request before that. The provisional rules below are isolated in **one** pure function each side (SQL + TS) and covered by golden cases, so a confirmed rule is a contained change.

## What was done
| Object | Notes |
|---|---|
| `rule_versions.reserve_ratio` | The reserve is a **versioned rule** (levels kind), seeded with 0.10. Backfilled once for the seeded published version, with the immutability trigger deliberately disabled for that single structural UPDATE. New drafts copy it; `rpc_update_reserve_draft` edits it in a draft; `rpc_rules_at` returns it. |
| `app_private.commission_split(points, producer, producer_rate, chain, reserve_ratio)` | **The** commission rule. Personal = points × own rate. Differential = **rate compression (OD-05, provisional)**: walk up the chain (nearest first); each ancestor gets max(0, own rate − highest rate paid so far). Rounding: gross 2 dp half-up, reserve = round(gross × ratio, 2), net = gross − reserve. Ancestors without a level (`rate: null`) are skipped here; booking turns them into exceptions. |
| `src/domain/commission.ts` | TS mirror (`splitCommission`, `sumEntries`). `parseRules` now reads `reserveRatio`. |

## Golden cases (`GC-COMM-001…011`)
| ID | Case | Expected |
|---|---|---|
| 001 | FB, 10 own P (§14.2) | 560 / 56 / 504 |
| 002 | FB over FA, 10 P (§14.2/§17.3) | FA 280/28/252, FB 280/28/252 |
| 003 | DL → TL → FB → FA (§5.3) | FB 280, TL 140, DL 420 |
| 004 | DL directly above FA | DL 84/P → 840 (provisional) |
| 005 | manager on the same level | nothing; the next higher level gets the gap |
| 006 | 0.0001 P × 56 | 0.01 gross, 0.00 reserve |
| 007 | 3.1415 P × 56 = 175.924 | 175.92 / 17.59 / 158.33 |
| 008 | 0 points (Kfz) | no entries |
| 009 | −10 P (reversal) | exact negative mirror |
| 010 | TL producer under FB under DL | FB nothing, DL 42/P |
| 011 | ancestor without a level | skipped, next one gets the gap |

Properties (TS):
- a full FA→…→VD chain pays exactly the top rate in total (144 × 10 = 1,440)
- gross = reserve + net for every entry

## What to look out for
- **OD-05 is the biggest open business question in commission.** The compression walk matches every example in the spec, but the spec explicitly says not to assume it for every pair of levels (§5.3 note). If Profina's matrix differs, change `commission_split` and its golden cases; the ledger (next slice) stores the rate actually applied per entry, so history stays explainable.
- Rounding is per entry, not per statement. Totals are sums of rounded entries.
- The rate used is the level rate of the version **in force on the production date**, at the levels both people **held on that date** (next slice).

## How to verify
```bash
npm run test:db -- 080
npx vitest run src/domain/commission.test.ts
npm run check:golden
```
