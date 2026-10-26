# r1/p3/career-progress — Career simulator

| | |
|---|---|
| Branch | `r1/p3/career-progress` → merged into `r1/p3-cockpit` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 3 · `r1/p3/career-progress`; spec §7.4, §15 Phase 3 ("career simulator") |
| Status | Done; 9 new unit tests (287 total); no DB changes |
| Date | 2026-10-27 |

## What was done
The §7.4 progress display itself was built in `r1/p1/career-engine`. This slice adds the simulator.

| Path | What |
|---|---|
| `src/domain/careerSimulator.ts` | `simulateCareer(progress, additions)` re-runs **the same rule function as the database** (`applyCareerRules`, mirrored and golden-tested against `app_private.apply_career_rules`) with planned extra points: personal, personal KV, per structure. `careerGap(progress)` returns missing points/KV and **per-structure headroom** under the 50 % cap. Personal production is always unlimited. |
| `src/views/career/CareerSimulator.tsx` | Panel on `/vertrieb/karriere`, labelled **"Schätzung – wird nicht gespeichert"**. It shows what's missing and where structure points still count ("Grenze erreicht – weitere Punkte zählen nicht" / "noch X P anrechenbar"), offers inputs for extra points, and shows simulated meters for points and KV with a clear qualified / not-yet sentence. |

## How to verify
```bash
npx vitest run src/domain/careerSimulator.test.ts src/views/career
```
On staging: on `/vertrieb/karriere` as the §14.4 FB candidate (100 P / 7 KV), enter 3 extra KV points: the simulation says qualified.

## What to look out for
- **Bug found and fixed while testing:** the first version didn't count added personal KV points as points as well. A test caught it before merge.
- The simulator starts from today's server numbers; it doesn't know about future period resets. Near a period end, use the period date shown above it.
- No pace-based "will I make it" yet; that's the forecast slice.

## Edge cases covered by tests
- no additions → identical to the server result (100 P / 7 KV / not ready)
- +3 KV → ready, and the total becomes 103 (KV counts as points)
- adding to a **capped** structure changes nothing; adding to an uncapped one counts **up to the cap** (100 + 400 → 375)
- personal additions are never capped
- gap: 175 P and 27.5 KV missing (proportional KV of the capped structure)
- headroom A = 0, B = 275; no cap → unlimited
- UI: estimate label, headroom texts per structure, "wäre … erreicht" message
