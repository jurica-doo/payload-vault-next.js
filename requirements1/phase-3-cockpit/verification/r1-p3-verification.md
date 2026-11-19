# Phase 3 — Verification (spec ↔ docs ↔ code) and findings

| | |
|---|---|
| Date | 2026-11-19 |
| Branch | `feat/requirements1` |
| Scope | the five Phase 3 slices: goals, dashboards, career-progress (simulator), profiles-coaching, forecast — as they are **today** (after `20261031120000` `app_rpc`, the Phase 4 task engine that delivers the Phase 3 notifications, and the rules Stand 01.11.2026) |
| Method | Each slice note compared with the spec PDF (§7.1–7.5, §8.1–8.5, §11.2, §12.1–12.3, §13.1, §14.5, §15, §17.5) and with the final SQL and TypeScript. Visibility rules (RLS policies, `can_see_coaching`, `can_see_private_note`, `is_manager_of`, `visible_employee_ids`) read line by line and tried against the live local database with every persona. Forecast and simulator formulas recalculated by hand. |
| Automated | pgTAP 32 files / 919 assertions (new: `310_phase2_3_review_fixes`), Vitest 534 tests, Playwright `e2e/tests/phase3-cockpit.spec.ts` (12 tests, green on a fresh `npm run e2e`) |
| Fixes | 2026-11-19: migration `20261101150000_phase2_3_review_fixes.sql` + UI; every finding marked ✅ below |

Manual test guide (click by click): [r1-p3-manual-guide.md](r1-p3-manual-guide.md).

## 0. What Phase 3 is, in plain words

Phase 3 is the **management cockpit**: what every person and leader sees first, how monthly goals are
agreed, how a leader coaches, and honest estimates of where the month and the career period will end.

| Part | What it is responsible for | Where in the app | Try this | You should see |
|---|---|---|---|---|
| **1. Goals** | Each employee plans the current month and up to two ahead (points, KV, appointments, offers, sales, follow-ups, expected production, development goal). Submitting freezes an immutable version; a manager in the chain approves or returns it with a comment; the employee edits and resubmits. Goals are targets, never career thresholds. | Vertrieb → **Ziele** | Fritz submits 20 P / 2 KV; Tina returns "KV auf 3"; Fritz resubmits; Dora approves | Status Entwurf → Zur Freigabe → Zurückgegeben → Zur Freigabe → Freigegeben; two versions kept |
| **2. Dashboards** | **Mein Monat**: points/KV/AE this month and year, change vs. the goal, activity tiles, commission after reserve, career meters with pace, 6-month trend, to-dos. **Meine Struktur** (leaders): each direct report with own vs. structure production, goal status and qualification. **Datenqualität & Warteschlangen** (admin/finance): only items that need action. | Vertrieb → **Cockpit** (`/vertrieb`) | Open it as Fritz, Tina, admin | Three different pages from one URL |
| **3. Forecast** | Month-end at the current pace, the 3-month average for comparison, and a linear career projection ("bei gleichem Tempo … reicht / nötig wären x P pro Tag"). Always marked **Schätzung** with the method; never stored. | Cockpit → Prognose Monatsende, Karriere box | Compare with the real numbers | Estimates change with the day of the month; the meters don't |
| **4. Simulator** | "Was wäre, wenn": extra own points / KV / per structure, run through the **same** rule function as the database (caps, KV share). Shows what is missing and where structure points still count. | Vertrieb → **Karriere** → Simulation | Fritz +3 KV | "wäre die Qualifikation für FB erreicht"; nothing saved |
| **5. Profile & coaching** | Per person: 12-month trend, product mix, goal history, career status, **Gesprächsimpulse** (conversation prompts, never verdicts), coaching conversations with agreed actions, shared notes and **private manager notes**. Employees see their own actions on the dashboard and tick them off. | Vertrieb → Team → **Profil & Coaching** (`/vertrieb/team/<id>`) | Tina writes a private note about Fritz | Dora (Tina's manager) sees it; Fritz, finance, compliance and admin do not |

Who is who in the test data: `e2e/README.md` (password `123456` everywhere, 2FA codes via `npm run totp -- <email>`).

## 1. Result

**The workflows and the visibility rules are correct.** Goals keep every submitted version and every
decision; only managers in today's chain (or an admin with an employee record) may decide, never the
employee; returning needs a comment. Coaching data is visible to the person and their managers only;
private notes to the author and the author's managers only; finance, compliance and admins see no
coaching at all, and private text never reaches the audit log. Dashboard totals come from the points
ledger, so cancellations disappear everywhere at once and nothing is counted twice (§14.5). Forecasts
are labelled, carry their method and feed nothing official (§7.5). The simulator uses the same rule
function as the database (golden-tested), so it cannot disagree with the real calculation.

**What was wrong** (all fixed, section 3): the team dashboard showed "blocked" for a direct report whose
career periods had never been generated; finance/compliance (who may *see* every goal) were offered
"Freigeben" buttons that failed silently; an admin who is also a leader saw coaching forms for people
outside their structure; immutable comments and coaching texts were unbounded or failed with bare
database errors; raw status keys ("blocked", "top_level") leaked into the team table.

**Open** (section 3): monthly review checklist / quarterly review (§8.4), configurable prompt thresholds,
retention of coaching data (OD-16), a "Mein Profil" page for employees, finance/admin without an employee
record have no cockpit, activity-based prompts (Phase 4 data exists; prompts still use production only).

## 2. Spec vs. slice docs vs. code

| Spec | Requirement | Status |
|---|---|---|
| §7.1 | directory: level, history, manager, reports, period points, actuals vs targets, trend, commission summary, links | ✅ spread over Team, Karriere, Cockpit, Profil; commission summary only for the person/finance |
| §7.2 | monthly goals with all suggested fields; manager review/comment/approve/return; every version and the approval trail stored; targets ≠ career thresholds | ✅ `monthly_goals` + immutable `monthly_goal_versions` + append-only `goal_reviews`; fields incl. expected production and development goal; "commission forecast" field ✗ (optional in the spec); nothing feeds qualification |
| §7.2 | "goal values should be configurable by level or team" | ⚠️ no templates/defaults per level; AE derives from points automatically (28 AE/P of the month's rules) |
| §7.3 Employee | own points, AE, KV, targets, next-level progress, leads, appointments, tasks, own commission | ✅ all on `/vertrieb` (leads/tasks tiles came with Phase 4) |
| §7.3 Team leader | structure, team production, promotion readiness, goal completion, activity funnel, overdue follow-ups, differential commission | ✅ Meine Struktur + Hinweise (Phase 4 signals); differential commission on Provisionen; "activity funnel" is on Leads → Auswertung |
| §7.3 Higher-level leader | multi-team production, comparisons, career pipeline, forecast, subsidy overview, exception alerts | ◐ direct reports with their structures; subsidy overview and exception alerts are finance/admin only (OD-17) |
| §7.3 Administrator | rule configuration, hierarchy exceptions, user access, data quality, recalculation queue, audit trail, integration status | ✅ data quality + queues on `/vertrieb` and the `/admin` pages; ⚠️ no audit-trail page (Phase 1 note), no integrations yet |
| §7.4 | current level, target, required, credited, remaining, KV required/achieved, per-structure credits and caps, period end, pace | ✅ Karriere page (Phase 1) + cockpit meters + `expected_now` pace line + forecast sentence |
| §7.5 | forecast labelled as estimate; pace/historical/open opportunities/appointments; method visible; never alters official results | ✅ pace + 3-month average + career projection with method text; ✗ open opportunities / planned appointments not used (data exists since Phase 4 → follow-up) |
| §8.1 | production, activity, conversion, economics, career, quality, development dimensions | ◐ production, career, development (actions), goal history; activity/conversion on the Phase 4 pages; economics and quality ✗ |
| §8.2 | funnel with stated denominator and window | ✅ Phase 4 (`/vertrieb/leads/analyse`) |
| §8.3 | prompts: low activity, high activity/low conversion, good conversion/low volume, KV gap, declining trend, overdue tasks | ◐ `kv_gap`, `declining_trend` (3 vs previous 3 months < 80 %), `behind_goal` (< 80 % of pro-rata), `overdue_actions`; activity/conversion prompts ✗ (Phase 4 data available → follow-up); thresholds fixed at 80 % (CHECKLIST 6.3) |
| §8.4 | conversation date, participants, actions with owner/due; private manager notes with strict permissions; monthly checklist / quarterly review; actions on the next dashboard; retention policy | ✅ sessions/actions/notes, private vs shared, actions on the dashboard; ✗ checklist/quarterly review; ✗ retention (OD-16) |
| §8.5 | human judgement, no automatic ranking, metric definitions visible, restrict sensitive notes | ✅ prompts are questions with "keine Bewertung"; no ranking; private notes restricted; ⚠️ metric definitions are in the captions, not a glossary |
| §11.2 | goal behind pace (actual vs target + month-end estimate); career period ending; overdue tasks | ✅ cockpit tiles + Phase 4 generators `goal_review`, `coaching_action`, `coaching_review`, `career_period_end` |
| §12.1 | finance: "no unnecessary access to coaching notes" | ✅ finance, compliance **and admins** see no coaching data (least privilege); admins see the profile without coaching |
| §12.2 | private coaching notes restricted more tightly than profile fields | ✅ author + author's managers, never the subject, never roles |
| §12.3 | audit reporting line, levels … | ✅ goals (status), sessions, actions, notes audited; **summary and note text redacted** |
| §13.1 | MonthlyGoal fields | ✅ |
| §14.5 | submit → approve/return with comment; dashboard actuals from validated records without double counting | ✅ pgTAP 120/130, e2e |
| §15 | career simulator, structure drill-down, performance profiles, manager review workflows | ✅ |
| §17.5 | personal points / team production / promotion-eligible points / KV points definitions | ✅ cockpit "Eigen" vs "Struktur" vs Karriere "angerechnet"; captions say "nach Produktionsdatum" |

Doc statements that were **not true** of the code (now fixed or corrected):
- dashboards doc: "`rpc_dashboard_team` computes qualification per direct report" — it did, but without generating periods first, so people who had never opened their own pages (or before the cron ran) were "blocked / no_period" (P3-TEAM-01).
- goals doc: "RLS: self + structure + admin/finance/compliance" — true for *seeing*; the UI treated every visible submitted goal as reviewable (P3-GOAL-01).
- profiles doc: "Managers also get forms …" — the UI decided "manager" from `isLeader && not self`, i.e. any leader (incl. admins with reports) on any profile they could open (P3-COACH-02).

## 3. Findings

Severity: high (wrong data / access / blocked flow), medium (misleading or silently wrong), low (polish).
`e2e` = regression test in `e2e/tests/phase3-cockpit.spec.ts` (title contains the ID); `pgTAP` = `310_phase2_3_review_fixes.test.sql`.

| ID | Sev. | Area | Finding | Evidence | Status |
|---|---|---|---|---|---|
| **P3-TEAM-01** | high | team dashboard | A direct report whose `career_periods` had never been generated (periods are created lazily by their own career page / cockpit, or by the 15-minute cron) showed **"blocked"** in the Karriere column — raw English key, wrong information. On a fresh production database without pg_cron this is every direct report. | `rpc_dashboard_team` called `compute_qualification` without `generate_periods` | ✅ fixed — periods are generated for the direct reports first; statuses other than ready/in progress read "nicht berechenbar" / "höchste Stufe". pgTAP, e2e, vitest |
| **P3-GOAL-01** | medium | goals | Finance, compliance and admin-employees see every goal (RLS, intended), so `/vertrieb/ziele` listed **all** submitted goals of the company under "Zur Freigabe" with "Freigeben" buttons; clicking → `forbidden` from the database, but the rejection was **unhandled** (no toast, nothing happens). | `toReview` filtered on status only; `decide()` without try/catch | ✅ fixed — `v_goals.can_review` (today's managers, admins with an employee record, never the employee) decides what the list shows; refusals become a toast "Entscheidung nicht gespeichert". pgTAP, e2e, vitest |
| **P3-COACH-02** | medium | profile | An admin who is also a leader (Erika) opening the profile of someone outside their structure saw the "Gespräch dokumentieren" and "Notiz" forms; saving → `forbidden`. | `isManager = isLeader && !self` in `ProfilePage.tsx` | ✅ fixed — `rpc_performance_profile` returns `can_coach` (= `is_manager_of`); forms only then. pgTAP, e2e, vitest |
| **P3-GOAL-02** | medium | goals | Submission and review comments are **immutable** (versions, reviews) and were unbounded; a 10 MB comment would be permanent. | `rpc_submit_goal`, `rpc_review_goal` | ✅ fixed — 4.000 characters, `text_too_long`. pgTAP, e2e |
| **P3-COACH-01** | medium | coaching | `participants` was unbounded; summary/note/title limits failed with a bare CHECK error (generic German text); a wrong action owner or note visibility raised `invalid_payload`, whose German text talks about an **import file**. | `rpc_add_coaching_session`, `rpc_add_coaching_note`, CHECKs | ✅ fixed — `text_too_long`, `title_too_short`, `invalid_input`, `date_required`; `participants ≤ 500` CHECK. pgTAP, e2e |
| **P3-UI-01** | low | goals | Editing an approved goal silently puts it back to "Entwurf" (by design) without telling the employee that it must be submitted again. | `rpc_save_goal_draft` resets the status | ✅ fixed — note on approved goals: "Änderungen setzen es auf „Entwurf“ zurück …". vitest |
| **P3-UI-02** | low | dashboard | The "Vereinbarte Maßnahmen" checkbox was uncontrolled: after a failed save it stayed ticked while the action was still open. | `MyActions` | ✅ fixed — controlled (shows the pending state), disabled while saving |
| P3-OPEN-01 | — | prompts | §8.3 activity/conversion prompts (low activity; high activity, low conversion; good conversion, low volume) — the Phase 4 activity data exists, the profile doesn't use it yet. Thresholds fixed at 80 %. | `rpc_performance_profile` | open (CHECKLIST 6.2/6.3) |
| P3-OPEN-02 | — | forecast | §7.5 open opportunities and planned appointments as forecast inputs. | `forecast.ts` | open |
| P3-OPEN-03 | — | coaching | §8.4 monthly review checklist, quarterly development review; retention policy (OD-16, notes are append-only → deletion needs an audited admin procedure). | — | open |
| P3-OPEN-04 | — | access | Employees can't open their own profile page (team module is leader-only); they see their actions on the cockpit and shared notes nowhere. Finance/admin without an employee record have no cockpit. Admins without an employee record can't review goals (`reviewer_not_employee`). | module audience | open (decisions) |
| P3-OPEN-05 | — | goals | §7.2 goal defaults per level/team; optional commission forecast field. | — | open |
| P3-NOTE-01 | low | goals | Finance and compliance can **read** every goal including the free-text development goal (via `visible_employee_ids`). Consistent with the Phase 1 role model ("finance sees all employees"); flag for the role matrix (§12.1). | `goals_select` | decision |
| P3-NOTE-02 | low | goals | A submitted goal of a **past** month can still be approved/returned (no month check on review). Harmless; a late decision is still a decision. | `rpc_review_goal` | noted |
| P3-NOTE-03 | low | performance | `rpc_dashboard_team` runs `compute_qualification` per direct report (+ now `generate_periods`); fine for typical spans, cache for 50+ reports (doc note stands). | — | noted |

Checked and **correct** (no finding): `late` = submitted after the 1st; `awaiting_review` locks edits; `goal_empty`; `month_closed` / `month_too_far` (current + 2); `kv_above_points`; counts must be whole numbers; unknown keys refused; AE derived with the month's rules; returning needs a comment (CHECK); `cannot_review_own`; one decision per submission; an inactive manager is skipped as the responsible reviewer; versions and reviews append-only even for `postgres`; dashboard month/year/trend from eligible calculations only, cancellations flow through; commission tile = ledger of the month; to-dos; `rpc_dashboard_admin` refused for employees; team totals use today's structure (documented, intended); forecast edge cases (first day, leap year, period end, negative actuals) and the simulator (KV counts as points, caps, headroom) match the docs; private note text redacted in audit; employee can't add notes about themselves; peers see nothing; the leader's own action can't be completed by the employee.

## 4. Manual test plan

[r1-p3-manual-guide.md](r1-p3-manual-guide.md) — 7 sections in order, section 6 re-checks the fixed findings, section 7 is the UI/UX checklist.

## 5. Automated coverage

| File | Tests |
|---|---|
| `supabase/tests/120_goals.test.sql` | validation, draft/submit/versions/late, review rights (peer, own, indirect manager, inactive manager), immutability |
| `supabase/tests/130_dashboards.test.sql` | month/year/trend, goal and career snapshot, commission, to-dos, cancellation, team rows and totals, admin refused, data quality |
| `supabase/tests/140_coaching.test.sql` | write rights, action owners, future date, visibility per persona, immutability, audit redaction, profile and prompts |
| `supabase/tests/310_phase2_3_review_fixes.test.sql` | **P3-TEAM-01**, **P3-GOAL-01** (`can_review` per persona), **P3-GOAL-02**, **P3-COACH-01**, **P3-COACH-02** |
| `src/domain/forecast.test.ts`, `careerSimulator.test.ts`, `qualification.ts` golden | formulas |
| `src/views/goals|dashboard|team/*.test.tsx` | locked form, feedback, decimals, review list incl. `can_review`, refused decision toast, approved-goal note, KPIs vs goal, forecast labels, actions, team statuses in German, admin list, prompts wording, private badge, forms by `can_coach` |
| `e2e/tests/phase3-cockpit.spec.ts` | goal submit → return → resubmit → approve by an indirect manager (versions, review comment), dashboard vs goal + forecast labels; **P3-GOAL-01**, **P3-GOAL-02**; **P3-TEAM-01** (periods deleted → still "in Arbeit", "nicht berechenbar" for Nora); coaching session + action + private note; visibility per persona incl. audit redaction; **P3-COACH-02**; action ticked off on the dashboard; **P3-COACH-01**; simulator +3 KV |

Not automated: the generators' notifications for goal review / coaching review in the browser (pgTAP 150/270 cover the generators), period rollover effects on the forecast, 360 px layouts.

## 6. Decisions for Profina touched by Phase 3
Who may review goals when there is no manager (admins without an employee record) · finance/compliance reading goals (P3-NOTE-01) · retention of coaching data (OD-16) · prompt thresholds and which activity prompts to switch on · a "Mein Profil" page for employees · whether leaders should see subsidy and exception information (OD-17).
