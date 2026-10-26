# r1/p4/task-engine — Shared tasks and notifications

| | |
|---|---|
| Branch | `r1/p4/task-engine` → merged into `r1/p4-leads-tasks` |
| Plan section | IMPLEMENTATION_PLAN.md §3.6, §6 Phase 4 · `r1/p4/task-engine`; spec §11 |
| Status | Done; 28 new pgTAP assertions (507 total), 5 new unit tests (312 total) |
| Date | 2026-10-28 |

## What was done
### Database — `20261028100000_tasks.sql`
| Object | Notes |
|---|---|
| `tasks` | Owner, creator, `source` (manual/system), `type` (manual, goal_review, coaching_action, coaching_review, career_period_end, calculation_exception, lead_*, customer_service, subsidy_review), title, description, **link to the causing record**, due date, priority, status `open/done/cancelled` + completion note. **At most one open system task per (type, record, owner)** (unique index) → generators are idempotent. Audited. |
| `notifications` | Per employee, with an optional in-app link (pattern-checked to relative paths only) and a `critical` flag. |
| `notification_preferences` | Muted non-critical kinds. **Critical kinds can't be muted** (§11.3): `calculation_exception`, `goal_review`, `reassignment`. |
| `app_private.run_task_generators()` | Creates **and closes** system tasks. **Reassignment**: open tasks of inactive people go to their nearest active manager (+ notification). **goal_review**: submitted goal → nearest active manager; closes once reviewed. **coaching_action**: overdue open action → its owner; closes when done. **coaching_review**: next review within 7 days → the leader. **career_period_end**: period ends within 30 days and not qualified → employee (with the exact missing P/KV), plus a notification to the manager (at most weekly). **calculation_exception**: open exception → every active finance user (critical). |
| `app_private.schedule_jobs()` | Schedules the generators every 15 minutes with **pg_cron if enabled** (idempotent). |
| RPCs | `rpc_create_task` (for yourself or your structure; the owner must be active; notifies the assignee), `rpc_set_task_status` (owner or manager; reopen clears completion), `rpc_reassign_task` (manager, reason), `rpc_mark_notifications_read`, `rpc_set_muted_notifications` (silently drops critical kinds), `rpc_run_task_generators` (admin, on demand). |
| RLS | Tasks: owner, the owner's managers, admin. Notifications/preferences: only the recipient. |

### Frontend
| Path | What |
|---|---|
| `/vertrieb/aufgaben` | "Meine Aufgaben" / "Team" (leaders). **Overdue** section in red, open tasks by due date, closed ones collapsed. A checkbox completes/reopens; type label, due date, priority badge, and an "Öffnen" link to the causing record. "Aufgabe anlegen" (leaders can assign within their structure). |
| Notification bell | In the sales sub-navigation: unread badge, list with links (marks read on click), "Alle gelesen", and mute settings that explain critical kinds stay visible. |
| `berlinLocalToUtcIso(date, time)` | Due dates are Berlin wall-clock times converted to UTC **correctly across DST** (a hard-coded `+01:00` in the first draft would have been an hour off in summer; fixed and tested). |

## Production rollout notes
1. Enable the **pg_cron** extension in the Supabase dashboard (Database → Extensions).
2. Run `select app_private.schedule_jobs();` once (it returns `scheduled`).
3. Until then, admins can call `rpc_run_task_generators()`; without cron no tasks appear automatically.

## How to verify
```bash
npm run test:db -- 150
npx vitest run src/views/tasks src/utils/format.test.ts
```
On staging, after enabling cron:
1. Submit a goal: within 15 minutes the manager has a "Ziel prüfen" task plus a notification.
2. Review it: the task closes.
3. Deactivate a manager with open tasks: they move to the next manager.

## What to look out for
- The generators walk all active employees for `career_period_end` (one qualification computation each). Fine for hundreds; at thousands, run that generator nightly instead of every 15 minutes.
- **No e-mail delivery** (Phase 6). Notifications are in-app only; the bell refreshes every 60 s.
- The plan's "escalation rule" exists as the reassignment of inactive owners and as manager notifications (career end; lead SLA in the next slice). Configurable escalation chains aren't built.
- Recurrence ("every Monday") isn't built; nobody has asked for it yet.

## Edge cases covered by tests
**Manual tasks**
- own tasks; refused for a manager; assigned by a manager with a notification
- done/reopen and completed_at
- peers see nothing and can't complete
- an indirect manager sees the team's tasks
- reassignment needs a reason

**Generators**
- goal review → manager; idempotent; critical notification; closes after review
- overdue coaching action → owner; closes when done
- exception → finance; closes when resolved
- inactive owner → tasks move to the next active manager, who is notified

**Notifications**
- critical kinds can't be muted
- a muted kind creates no notification but the task still exists
- mark all read; notifications private to the recipient

**Admin trigger**
- admin only

**Frontend**
- overdue/upcoming/closed partition and sort
- Berlin time in winter, summer and on both DST switch days
