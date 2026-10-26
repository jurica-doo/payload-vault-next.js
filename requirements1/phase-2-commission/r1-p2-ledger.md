# r1/p2/ledger — Commission ledger, automatic booking, exception queue

| | |
|---|---|
| Branch | `r1/p2/ledger` → merged into `r1/p2-commission` |
| Plan section | IMPLEMENTATION_PLAN.md §3.4, §6 Phase 2 · `r1/p2/ledger`; spec §5.4, §6.1–6.3, §11.2, §13.2, §14.2–14.3 |
| Status | Done; 34 new pgTAP assertions (350 total) |
| Date | 2026-10-26 |

## What was done — `20261026210000_commission_ledger.sql`
| Object | Notes |
|---|---|
| `statement_periods` | One row per month, status `open / reviewed / approved / paid` (managed in the statements slice). Readable by all signed-in users. |
| `commission_ledger` | **Append-only** (trigger, also for `postgres`). Stores calculation, production, producer, recipient, relationship (`self/direct/indirect`) and depth, **both levels on the production date**, type (`personal/differential`), kind (`original/reversal` + `reverses_entry_id`), points, rate applied, **gross / reserve / net after reserve** (CHECK: gross = reserve + net), statement period and rule version. Unique `(calculation, recipient, type)`, so the same roll-up can't be booked twice (§5.4). |
| Automatic booking | AFTER INSERT trigger on `point_calculations`: points and commission are written **in the same transaction**. An original uses `commission_split` with the hierarchy, levels and level rates **on the production date**. A reversal is an **exact negative mirror** of the reversed calculation's entries. 0-point production books nothing. |
| Booking month | `app_private.booking_period()`: the first month from the current Berlin month whose status is `open` (created on demand). Once finance has reviewed/approved/paid a month, new entries and reversals go to the next open month, so **approved statements never change** (§14.3). |
| `exception_queue` | Anything that can't be calculated confidently goes here instead of a default (§11.2, §16). Booking raises `producer_without_level`, `ancestor_without_level` (names the ancestor) and `no_rules_for_date`. **Nothing is booked for that calculation**: skipping an ancestor would hand their share to the next one, which is a guess. A cancelled calculation dismisses its open exception automatically. |
| `rpc_retry_commission(calc)` | Finance/admin + MFA, after fixing the cause. Refuses `still_not_bookable`, `already_booked`, `already_reversed`. Success resolves the exception. |
| `rpc_dismiss_exception(id, reason)` | Finance/admin + MFA + reason. |
| Visibility (`can_see_commission_of`) | Own entries; finance and admin see all; **leaders see their structure's commission only if `app_settings.commission.leader_sees_team_commission` is on** (OD-17, default off). |
| `v_commission_ledger` | Ledger + month + production date/category + names. **Not** `security_invoker`, on purpose: a leader must keep seeing their **own** commission for production by someone who has since left their structure. Production/employee RLS would hide those rows (a test caught exactly that). Visibility is enforced in the view with the same rule as the table policy, and a test proves it shows nothing beyond the ledger rule. |

## How to verify
```bash
npm run test:db -- 090
```
On staging (with Phase 1 data): confirm an FA contract as eligible, then `select * from v_commission_ledger` as FA, FB, TL, DL and finance. Cancel it; the reversals land in the current open month.

## What to look out for
- **Rates follow levels on the production date.** A promotion later doesn't re-rate past production; that's intended (§1 historical integrity).
- **Leaders above someone without a level get nothing until it's fixed.** The finance UI shows the queue; fixing a level and pressing "erneut buchen" books it in the current open month.
- **Reserve** is only withheld and shown (OD-10). Release/clawback rows are a later addition once Profina defines them.
- **The view runs with its owner's rights.** If someone changes it, keep the `WHERE app_private.can_see_commission_of(...)` clause; the test "view leaks nothing" guards it.
- Booking performance: one `ancestors_at` per calculation, fine for interactive confirmation. A 5,000-row import confirmed at once does 5,000 bookings in one transaction; acceptable, but watch the duration.

## Edge cases covered by tests
- §5.3 chain DL → TL → FB → FA with 10 P: 280 / 280 / 140 / 420, each with a 10 % reserve; recipients in order; relationship, levels and applied rates recorded; total = DL rate × points (no double payment); booked in the current month
- booking the same calculation again writes nothing
- cancellation: 4 mirrored reversals, nets to 0
- Kfz: nothing booked
- producer without level: nothing booked, exception; retry refused while missing; level set → retry books 4 entries, exception resolved; booking twice refused
- **ancestor without level**: nothing booked, exception names the ancestor
- approved current month: bookings go to the next month
- **transfer**: production before pays the old TL, after pays only the new TL
- RLS: FA sees only own (table and view); a leader sees only own by default **and still sees own commission after the producer left**; with OD-17 on, the current leader sees the team, while the old leader doesn't see people who left; finance sees everyone and the queue; employees don't see the queue
- append-only for `postgres`
