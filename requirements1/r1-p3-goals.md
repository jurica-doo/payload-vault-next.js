# r1/p3/goals — Monthly goals with review workflow

| | |
|---|---|
| Branch | `r1/p3/goals` → merged into `r1/p3-cockpit` |
| Plan section | IMPLEMENTATION_PLAN.md §3.5, §6 Phase 3 · `r1/p3/goals`; spec §7.2, §14.5 |
| Status | Done; 27 new pgTAP assertions (415 total), 5 new unit tests |
| Date | 2026-10-27 |

## What was done
### Database — `20261027100000_goals.sql`
| Object | Notes |
|---|---|
| `monthly_goals` | One per employee and month. Holds the editable `draft` and the status `draft → submitted → approved / returned`. Editing an approved or returned goal puts it back to draft. Flag `late` = submitted after the 1st. Audited (status changes; the draft itself is excluded from audit noise). |
| `monthly_goal_versions` | **Immutable** copy of each submission with the employee's comment (§7.2). |
| `goal_reviews` | **Append-only** trail; returning requires a comment (CHECK). |
| `normalize_goal_targets` | Allowed fields: points, KV points, AE, expected production, appointments booked/held, offers, sales, follow-ups, development goal. Numbers ≥ 0 (2 dp); counts are whole numbers; **KV ≤ points**; unknown fields are refused; **AE defaults to points × the AE factor** of the month's rules. |
| `rpc_save_goal_draft(month, targets)` | Own goals only. **Current month and up to two ahead** (`month_closed`, `month_too_far`). Refuses while a goal waits for review (`awaiting_review`). |
| `rpc_submit_goal(goal, comment)` | Creates version n+1; refuses empty goals. |
| `rpc_review_goal(goal, approved/returned, comment)` | **Any active ancestor in today's structure, or an admin with an employee record. Never yourself** (`cannot_review_own`). One decision per submission. |
| `v_goals` | Goals + name + **responsible reviewer** (nearest *active* ancestor, so an inactive manager is skipped) + submitted targets + last review comment. RLS: self + structure + admin/finance/compliance. |

Goals are targets, **not** career thresholds (§7.2). Nothing here affects qualification.

### Frontend — `/vertrieb/ziele`
- Tabs for this month and the next two; a form with the §7.2 fields in German decimal input, the development goal and a submission comment.
- The status badge and a "nach Monatsbeginn eingereicht" note.
- The form is locked while a goal awaits review; the manager's feedback is shown on returned goals.
- **"Zur Freigabe"** list for leaders: team members' submitted goals with "Freigeben" / "Zurückgeben" (with feedback).
- German messages for all goal error keys.

## How to verify
```bash
npm run test:db -- 120
npx vitest run src/views/goals
```
Staging:
1. FA saves and submits 20 P / 2 KV.
2. TL returns it with "KV bitte auf 3"; FA sees the note, edits and resubmits (version 2).
3. DL approves. Deactivate TL: the reviewer shown becomes DL.

## What to look out for
- **Actual vs. target** (points/KV from the ledger, activity counts later) is shown on the dashboards (next slice). Appointments, offers and follow-ups have no actuals until the Phase 4 activity tracking exists.
- Goals of past months are read-only, even for admins; corrections need a new decision.
- Notifications to the reviewer ("goal waiting") come with the task engine.
- Admins without an employee record can't review goals (they aren't in anyone's structure). Profina would need to say whether that's wanted.

## Edge cases covered by tests
**Validation**
- AE derived from points × 28
- KV above points refused; fractional counts refused; negatives refused; unknown keys refused
- explicit AE kept; null ignored

**Workflow**
- draft created
- past month closed; at most two months ahead
- version 1 on first submission; late flag
- no edit while under review; no self-approval; an empty goal can't be submitted
- a peer can neither review nor see the goal
- the responsible reviewer is the direct manager
- returning needs a comment; returned with the comment (§14.5)
- resubmission is version 2, version 1 unchanged
- an indirect manager can approve; no double approval
- an inactive manager is skipped as the reviewer

**Immutability**
- versions and reviews are immutable even for `postgres`

**UI**
- the form is locked while under review
- feedback shown and submitted values prefilled
- a non-number is refused; German decimals are sent normalised
- the review list shows only team goals
