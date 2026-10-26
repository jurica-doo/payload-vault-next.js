# r1/p3/dashboards — Role dashboards

| | |
|---|---|
| Branch | `r1/p3/dashboards` → merged into `r1/p3-cockpit` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 3 · `r1/p3/dashboards`; spec §7.3, §14.5 |
| Status | Done; 18 new pgTAP assertions (433 total), 4 new unit tests (278 total) |
| Date | 2026-10-27 |

## What was done
### Database — `20261027110000_dashboards.sql`
| Object | Notes |
|---|---|
| `app_private.production_totals(emp, from, to)` / `structure_totals(leader, from, to)` | Sums of the **points ledger** (eligible calculations incl. reversals) by production date, for one person or a whole structure (today's). Cancellations disappear everywhere at once, and nothing is counted twice (§14.5). |
| `rpc_dashboard_me(month?)` | Own month and year-to-date points/KV/AE, a **6-month trend**, the goal (status + targets), a career summary (status, target, eligible vs required, KV, pace, period end), commission booked in the month (gross / after reserve), and to-dos: drafts not submitted, no goal for the month, structure goals waiting for review. |
| `rpc_dashboard_team(month?)` | Leaders: each **direct report** with level, own production, their structure's production, team size, goal status and qualification status; plus the whole structure's total and size. |
| `rpc_dashboard_admin()` | Admin/finance: **data quality**: active people without a level or without a place in the structure (names), expired invites. **Queues**: contracts to confirm, open exceptions, goals to review, past months not approved. |

### Frontend — `/vertrieb` (replaces the placeholder)
- **Mein Monat**: KPI tiles Punkte (with a change **vs. the goal**), KV, AE (+ year), commission after reserve; a career block with points and KV meters and a pace line; a trend chart with a caption; to-do links.
- **Meine Struktur** (leaders): a table of direct reports (own / structure / goal status / "qualifiziert").
- **Datenqualität & Warteschlangen** (admin/finance): only items that need action, each linking to the page that fixes it, with the first names listed.

### Test setup
`vitest.config.mts` now provides placeholder `NEXT_PUBLIC_SUPABASE_*` values, so a page that imports the Supabase client indirectly doesn't crash a test file. All calls are still mocked.
`scripts/db-test.sh` now **refuses test files with a comment after `\gset`**. This mistake had silently broken four test files during development.

## How to verify
```bash
npm run test:db -- 130
npx vitest run src/views/dashboard
```
On staging: open `/vertrieb` as FA, a leader, and admin; cancel a contract and check it disappears from the trend.

## What to look out for
- **Finance users without an employee record can't open `/vertrieb`** (the module is for employees). They use `/vertrieb/provisionen/abrechnung`, which shows the same queues. Admins without an employee record see the data-quality list only if they're also employees; otherwise `/admin` is their entry point.
- The **team totals use today's structure** (who is in the team now). Career and commission attribution still use the production date. That difference is intentional ("who is in my team" vs. "who earned what when").
- `rpc_dashboard_team` computes qualification per direct report. Fine for typical spans of control; for leaders with 50+ direct reports, consider caching.
- Activity KPIs (appointments, offers, conversion) come with Phase 4.

## Edge cases covered by tests
**DB**
- month points from **eligible production only** (drafts not counted); KV; year to date (handles January)
- 6-month trend ending this month
- goal status and targets; career summary
- commission booked this month
- open drafts counted; **a cancelled contract disappears from the trend**
- team: one direct report, FB's own (20) vs. FB's structure (10), whole structure 30
- leader with no submitted goals
- the admin dashboard is refused for employees
- admins see active people without a level

**UI**
- KPI shows −25 % vs. a 20 P goal
- to-dos only when relevant
- the team section only for leaders
- the admin list shows only non-zero items, with names
