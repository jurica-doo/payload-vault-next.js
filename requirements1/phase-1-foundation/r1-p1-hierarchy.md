# r1/p1/hierarchy — Effective-dated reporting lines

| | |
|---|---|
| Branch | `r1/p1/hierarchy` → merged into `r1/p1-foundation` |
| Plan section | IMPLEMENTATION_PLAN.md §3.1, §6 Phase 1 · `r1/p1/hierarchy`; spec §5.1, §14.3 |
| Status | Done; 37 new pgTAP assertions (151 total), 182 unit tests, performance checked with 5,000 employees |
| Date | 2026-10-26 |

## What was done

### Database — `20261026160000_hierarchy.sql`
| Object | Notes |
|---|---|
| `hierarchy_assignments` | `employee_id`, `manager_id` (NULL = top of a structure), `effective_from`, `effective_to` (exclusive), `change_reason`, `approved_by`. **Exclusion constraint**: no overlapping ranges per employee (`btree_gist`). CHECKs: not your own manager, no zero-length or inverted range. Audited. |
| Cycle trigger | `prevent_hierarchy_cycle` checks the new assignment's start **and every structure-change date inside its range**. The structure only changes at those dates, so this catches cycles that would appear only in the future. |
| `app_private.ancestors_at(emp, date)` | Reporting chain on a date (depth 1 = direct manager). **The basis for attributing production and commission in Phase 2**: always called with the production date. |
| `app_private.descendants_at(emp, date)` | Whole structure below someone on a date. |
| `app_private.visible_employee_ids()` | Self + descendants **as of today (Europe/Berlin)**, or everyone for admin/finance/compliance. Used by policies as `col IN (SELECT …)`, so Postgres evaluates it once per statement. |
| `app_private.business_today()` | `now()` in Europe/Berlin as a date. All "today" logic uses it. |
| `can_see_employee()` | Now includes the caller's structure. |
| `employees` policy | Rewritten to the set-based form above. |
| `v_current_hierarchy` | `security_invoker` view: today's manager for every visible employee. |
| `rpc_assign_manager(emp, manager, from, reason)` | Admin + MFA + reason. Closes the open assignment and opens a new one. A same-day change corrects the existing row instead of creating a zero-length one. Refuses: `before_start_date`, `manager_inactive`, `no_change`, `future_assignment_exists` (a planned transfer must be cancelled first), `before_current_assignment` (no rewriting of history), `hierarchy_cycle`. One change at a time (advisory lock). |
| `rpc_cancel_future_assignment(id, reason)` | Removes a planned (not yet effective, latest) transfer and reopens the previous assignment. |
| `rpc_my_context()` | `descendant_count` is real now, so **people with reports are "leaders"** and see the Team module (when its flag is on). |

**Deviation from the plan:** no stored `hierarchy_closure` table. Visibility is computed from the assignments on each query. A stored closure goes stale when a future-dated transfer takes effect at midnight without any write, and keeping it correct would need a cron job. Measured cost with 5,000 employees in a 6-level tree (as the top leader, through RLS):
- `select count(*) from employees`: **6 ms**
- the view: **12 ms**
- `descendant_count`: **5 ms**
- admin: **1 ms**

The plan's target is < 300 ms. Revisit only if the organisation grows by orders of magnitude.

### Frontend
| Path | What |
|---|---|
| `/vertrieb/team` | Tree of the caller's structure today; roots are expanded. Detail panel: personnel number, status, direct reports and total team size. Leaders see themselves as root; admins see every top-level structure. |
| `/admin/hierarchie` | Pick a person, then see the history (current and planned assignments flagged, reason shown) and add a new assignment (manager or "Keine (Spitze der Struktur)", effective date defaulting to today in Berlin, reason). Planned transfers can be cancelled with a reason. Everything is disabled without MFA. |
| `EmployeePicker` | Searchable picker built on `Dropdown`. `undefined` = nothing chosen, `null` = explicit "none". Marks inactive people. |
| `buildStructure()` | Rows → tree (roots = people whose manager isn't visible), German sorting, descendant counts, cycle-safe. |

## How to verify
```bash
npm run test:db -- 040
npm test
```
On staging, as admin:
1. Build DL → TL → FB → FA.
2. Log in as FB: Team shows FB and FA only.
3. As DL: everyone.
4. Plan FB → TL2 for a future date: today's views don't change, and the history shows "Geplant".
5. Cancel it: the old line is open again.
6. Try DL under FA: you get the cycle error message.

## What to look out for
- **Attribution must use `ancestors_at(…, production_date)`**, never today's structure. This is what makes "a transfer doesn't rewrite paid statements" (§14.3) hold in Phase 2.
- **Leaders don't see their own manager or sibling structures.** If the UI later needs "my manager's name", add it to `rpc_my_context` rather than widening RLS.
- **Back-dating is refused** (`before_current_assignment`). Fixing a genuinely wrong past assignment needs an explicit correction workflow with its own audit, and that has to respect locked statement periods (Phase 2). That workflow is deliberately not built yet; OD register: transfer/exception rules (spec §16 "Hierarchy changes").
- **Inactive managers keep their reports.** The plan wants a reassignment task (task engine, Phase 4). Until then, the history and `/admin/hierarchie` show it; nothing reminds anyone.
- **Employees without any assignment** don't appear in anyone's structure except their own and admins'. New employees should get an assignment right after creation. A data-quality check for this belongs in the admin dashboard (Phase 3).
- The mutation passes `p_manager_id: null` through a cast, because the generated RPC types don't mark the argument as nullable. The DB handles NULL (top of a structure).

## Edge cases covered by tests
**Permissions**
- non-admin → `forbidden`; admin at aal1 → `mfa_required`; a reason is required
- direct INSERT as an employee is refused

**Traversal**
- FA's chain is FB, TL, DL in order
- DL has 4 descendants
- no chain before the assignments start

**Visibility**
- FA sees 1 (themselves), FB sees 2, DL sees 5
- DL doesn't see a peer outside the structure
- TL sees neither their own manager nor the sibling TL2's structure
- the view respects RLS
- a peer isn't a leader

**§14.3**
- a new FA under FB is visible to DL as an indirect report at depth 3

**Cycles**
- DL under their own descendant → `hierarchy_cycle`
- self as manager → `hierarchy_cycle`
- a **future** cycle (TL under FA in 2027) is caught
- the same move becomes allowed once FB has left TL's structure

**Transfers**
- before the transfer date FA rolls up through TL, from it through TL2
- the old assignment closes on the transfer date
- a future transfer doesn't change today's visibility

**Refusals**
- inserting before a planned transfer
- backdating before the current assignment
- before the employee's start date
- the same manager again
- an inactive manager
- cancelling a planned transfer reopens the previous assignment

**DB guards**
- overlapping ranges refused even for `postgres` (23P01)
- zero-length range refused
- the business date is Berlin time

**Frontend (`buildStructure`)**
- roots
- German sorting (Ä before T)
- descendant counts
- a leader is the root when their manager is hidden
- inactive people marked
- cyclic data doesn't loop
