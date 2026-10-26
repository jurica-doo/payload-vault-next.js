# r1/p4/lead-analytics — lead funnel, rates, sources, costs

Branch `r1/p4/lead-analytics` → merged into `r1/p4-leads-tasks`.
Spec: §8.2 (consistent definitions, visible denominators), §9.4 (lead performance analytics), §17.5.

## What was built

**Database** — `supabase/migrations/20261028130000_lead_analytics.sql`
`rpc_lead_funnel(from, to, scope)` returns one JSON report for a **cohort**:
- **Cohort** = leads **received** in `[from, to)` (Berlin dates; at most 2 years). Merged duplicates are excluded.
- **Attribution** = the lead's **current** owner. A reassigned lead counts for the new owner.
- **Scopes**:
  - `me`: own leads.
  - `team`: own leads plus the structure today.
  - `all`: admins only; includes the pool.
- **Funnel steps** count how far a lead got **at least**:
  - The furthest open stage it ever entered (from the stage history), combined with the facts: first contact, a "reached" activity, a booked or held appointment.
  - A won lead counts in every step.
  - So a skipped stage never makes the funnel go *up* from one step to the next.

| Key | Content |
|---|---|
| `totals` | leads, contacted, reached, qualified, booked, held, offer, won, lost, open, unassigned |
| `first_contact` | number of contacted leads, average and median hours to first contact (calendar hours), contacted within the SLA, open leads already over the SLA |
| `by_source` | leads, contacted, booked, won, points from linked contracts. **Only for `all`:** commission (gross) from linked contracts, cost (sum of the source's monthly costs for months starting in the window), cost per lead, cost per sale. Each is `null` when no cost is recorded. |
| `by_owner` | leads, contacted, booked, won, average first-contact hours |
| `by_stage` | open leads per stage, with average age in days since receipt |
| `loss_reasons` | count per reason code |
| `by_month` | leads and won per receipt month |

**Frontend**
- `src/domain/funnel.ts`: funnel steps and the four §9.4 rates, each as a numerator/denominator pair with a written definition:
  - Kontaktquote = Kontakt versucht ÷ Leads
  - Terminquote = vereinbart ÷ erreicht
  - Erscheinensquote = durchgeführt ÷ vereinbart
  - Abschlussquote = gewonnen ÷ Leads
- `useLeadFunnel(from, to, scope)` in `useLeads.ts`.
- `/vertrieb/leads/analyse` (`LeadAnalyticsPage`), linked from the lead list as „Auswertung“:
  - PeriodSelector (month, year or range) and a scope switch (Meine / Mein Team for leaders / Gesamt for admins).
  - Rate tiles showing "x von y · Definition".
  - `FunnelChart` with the window and the attribution rule in the caption.
  - First contact (average, median, share within the SLA, overdue ones), open leads by stage with their age.
  - A sources table; cost and commission columns appear only in Gesamt.
  - Per-person table (team and all), loss reasons with their share of all lost leads, and a per-month breakdown.

## Tests
- pgTAP `180_lead_analytics.test.sql` (20):
  - A fixed cohort: one lead won through every step, one lost after an unanswered attempt, one untouched, one moved straight to Angebot (skipped stages), one in the pool, one outside the window.
  - Checks every total, first contact, loss reasons, per-owner rows, own vs team scope, admin-only `all`, cost per lead/sale (100 € / 5 leads / 1 won), no costs outside `all`, and window validation.
- Vitest: `funnel.test.ts` (3), `LeadAnalyticsPage.test.tsx` (3).
- Totals: 582 pgTAP assertions (19 files), 341 unit tests, 47 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. As a leader, open Leads → Auswertung. „Mein Team“ is preselected. Every percentage shows its "x von y".
2. Move a lead straight from Zugewiesen to Angebot. The funnel still decreases step by step, and the lead counts as erreicht/Termin vereinbart.
3. As an admin, record a cost for a source in `/admin/leads`. In „Gesamt“, Kosten/Lead appears; in „Mein Team“ it doesn't.
4. Pick an empty month: you get a clear empty state, not „NaN %“.

## Edge cases & decisions
- **Cohort by receipt date**, not by activity date. A lead received in October and won in November counts as October's win. The caption says so. (Activity counts by month already live on the activities page and dashboard.)
- **Current owner** attribution: the alternative (owner at receipt) would need the assignment history in every query. The history exists, so this can change if Profina prefers.
- **Costs and commission are organisation-level**. A team view would divide the whole campaign cost by only the team's leads, which would be misleading, so they are admin-only.
- Time to first contact is in **calendar hours** (what the customer experiences). SLA compliance uses the business-hour deadline stored on each lead.
- Points and commission come only from leads with a **linked contract** (`production_id`), which the spec calls "reliably linked".
- Window limited to 2 years to keep the query bounded.
