# r1/p6/advanced-analytics — source trends, trend prompts, auto-assignment

Branch `r1/p6/advanced-analytics` → merged into `r1/p6-automation`.
Spec: §9.4 (performance of each campaign/source over time, cost per lead/sale), §8.3/§8.5 (rule-based insights worded as prompts), §9.3 (optional auto-assignment), §15 Phase 6.

## What was built

**Database** — `supabase/migrations/20261030120000_advanced_analytics.sql`
- `rpc_source_trends(months)` (admins only, because it contains organisation-level money):
  - Per source and receipt month: leads, contacted, won, points and gross commission from linked contracts.
  - The recorded cost for that month, and cost per lead and per sale (only when a cost exists).
  - Covers up to 36 months; months with neither leads nor cost are left out.
- `rpc_team_signals()` (leaders for their structure, admins for everyone):
  - **Team** (last 30 days vs the 30 before, cohort by receipt, **only with at least 10 leads in each window**):
    - `contact_rate_down`: contact rate below 80 % of the earlier rate.
    - `booking_rate_down`: booking rate below 80 % of the earlier rate.
    - `sla_breaches_up`: share of leads past the first-contact deadline more than 1.25 times the earlier share, and at least 3 such leads.
  - **Per person**:
    - `overdue_tasks`: at least 5 tasks overdue by more than 2 days.
    - `leads_without_next_step`: at least 5 contacted open leads with no next step planned.
  - Each signal carries its numerator and denominator.
- **Auto-assignment** (§9.3 "optional future"), **off by default**:
  - Setting `app_settings.lead_auto_assign {enabled, max_open_per_person}`. Only admins (MFA) can change it, with a reason.
  - When on, pool leads **created by a leader** go to the active member of that leader's structure with the fewest open leads, below the cap. Ties go to whoever was assigned least recently.
  - Admin-created pool leads stay manual.
  - Each assignment is recorded like a manual one, with a system actor and reason „Automatische Zuweisung (geringste Auslastung)“. The stage moves Neu → Zugewiesen and the new owner is notified.
  - It runs **before** the lead task generators, so the first-contact task exists in the same run.
  - `run_task_generators()` = auto-assignment + core + leads + customers.

**Frontend**
- `src/domain/signals.ts`: German prompt texts. They are **questions with numbers**, e.g. „Kontaktquote … 33 % (4 von 12) gegenüber 100 % (12 von 12) davor – lohnt sich ein Blick auf die Erstkontakte?“, never verdicts (§8.5).
- Dashboard → Meine Struktur: a „Hinweise“ box with the prompts (leaders and admins).
- Lead analytics: „Quellen im Zeitverlauf“ table for admins.
- `/admin/leads`: „Automatische Zuweisung“ card to switch it on or off and set the cap, with a reason.
- Hooks `useSourceTrends`, `useTeamSignals`, `useAutoAssign`.

## Tests
- pgTAP `260_advanced_analytics.test.sql` (16): contact-rate drop detected with its denominator; SLA breaches up; person without next steps; advisers and people without a structure get no signals; source trends admin-only; leads counted once per month; cost in its month; auto-assignment off by default; only admins switch it on; least-loaded member chosen; stage moves; system assignment recorded; first-contact task in the same run.
- Vitest `signals.test.ts` (2) plus a dashboard test for the prompts.
- Totals: **766 pgTAP assertions** (27 files), 366 unit tests, 58 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. As a leader with an active team, the dashboard shows „Hinweise“ only when there is enough data. Fewer than 10 leads per window gives no team prompts.
2. As admin, lead analytics → „Quellen im Zeitverlauf“: record a monthly cost for a source and check cost per lead and per sale.
3. Switch on auto-assignment with a cap of 2. As a leader, put three leads in the pool and run the generators: they spread across the team, and nobody gets more than 2.

## Edge cases & decisions
- Thresholds (80 %, 1.25×, 10 leads, 5 tasks) are fixed in the function for now. Making them settings is listed for clean-up.
- Signals compare **cohorts by receipt date**, so a lead received 35 days ago and contacted yesterday counts as „contacted“ in the earlier window. Deliberate: it measures how each intake was handled.
- Auto-assignment uses **open-lead count** as availability. Geography, product expertise or response performance (§9.3) need data that doesn't exist yet.
- Signals are computed on demand (no stored alerts, no notifications) to avoid alert fatigue. They can be turned into weekly notifications later.
