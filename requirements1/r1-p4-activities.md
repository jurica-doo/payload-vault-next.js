# r1/p4/activities — calls, contact attempts, appointments

Branch `r1/p4/activities` → merged into `r1/p4-leads-tasks`.
Spec: §8.2 (consistent funnel definitions), §9.1 (activities on leads), §13 (one activity model for leads and customers).

## What was built

**Database** — `supabase/migrations/20261028110000_activities.sql`
- `public.activities`: one log for every sales activity, used by the activities page, the dashboard and later by leads (`linked_type = 'lead'`) and customers (Phase 5).
  - Types: `contact_attempt`, `call`, `email`, `appointment`, `offer`, `followup`, `note`.
  - Outcomes: `reached` / `not_reached` (contact attempt, call, email); `held` / `no_show` / `cancelled` / `rescheduled` (appointments). A CHECK constraint rejects outcomes that don't fit the type.
  - An appointment needs `scheduled_at`. `linked_type` and `linked_id` are both set or both empty.
  - `production_id` is reserved for linking a sale (used by leads → won).
- Appointment states (derived): **vereinbart** (no outcome, slot in the future) → **Ergebnis fehlt** (slot passed, no outcome) → held / no_show / cancelled / rescheduled.
- RLS: read = owner, managers (whole structure, `is_manager_of`), admin. No direct writes for `authenticated`; all writes go through RPCs.
- Audit: `attach_audit` on the table; **notes are redacted** in audit rows (they may contain customer details).
- RPCs:
  - `rpc_log_activity(type, linked_type, linked_id, occurred_at, scheduled_at, outcome, notes, owner_id)`: own activities, or for a report if you are their manager. `occurred_at` may be at most 5 minutes in the future (`date_in_future`); appointments are scheduled with `scheduled_at` instead.
  - `rpc_set_appointment_outcome(id, outcome, notes)`: `held` / `no_show` only after the slot (`appointment_in_future`); cancel or reschedule any time. Only for appointments (`not_an_appointment`).
  - `rpc_activity_summary(employee, from, to)`: counts for `[from, to)` in Berlin time; self, managers and admins only.
- `app_private.check_activity_link(...)`: empty hook. `r1/p4/leads` replaces it to check that the linked lead exists and the owner may work on it.

**Funnel definitions** (written once, in SQL, so everyone counts the same way, §8.2)
| Figure | Counted when |
|---|---|
| Kontaktversuche | `contact_attempt` with `occurred_at` in the window |
| Erreicht | `contact_attempt` or `call` with outcome `reached` in the window |
| Termine vereinbart | appointment **created** in the window |
| Termine durchgeführt | appointment with outcome `held` and **slot** in the window |
| Nicht erschienen | appointment with outcome `no_show` and slot in the window |
| Angebote / Nachfassen | `offer` / `followup` with `occurred_at` in the window |

**Frontend**
- `src/hooks/useActivities/useActivities.ts`: `useActivities(filter)` (list, `log`, `setOutcome`) and `useActivitySummary(employee, from, to)`.
- `src/views/activities/ActivityPanel.tsx`: **reusable** log + quick-entry form. Pass `filter={{ linkedType: "lead", linkedId }}` to embed it in the lead detail (next slice) or the customer profile.
- `/vertrieb/aufgaben/aktivitaeten` (`ActivitiesPage`): the month's KPI tiles (with the denominator for the reach rate), the definitions in plain words, and the own activity log. Linked from the tasks page ("Aktivitäten & Termine"). It sits under the `tasks` feature flag, so no new flag was needed.
- Dashboard "Mein Monat": a new row with appointments booked/held, offers and follow-ups, each against the monthly goal's matching target (Phase 3 goals already had these fields; actuals now exist).
- `berlinToday()` in `src/utils/format.ts`: today's business date in Berlin (not UTC).
- German error texts: `date_in_future`, `appointment_in_future`, `not_an_appointment`.

## Tests
- pgTAP `supabase/tests/160_activities.test.sql` (16): constraints (appointment needs a time, outcome must fit the type, link pair), future dates, outcome rules, summary counts, manager visibility, manager logging for a report, peers see nothing and get no summary.
- Vitest: `ActivityPanel.test.tsx` (appointment state, month window, Berlin date across New Year and summer midnight) and a new dashboard test (activity tiles vs goal).
- Totals: 523 pgTAP assertions (17 files), 316 unit tests, 40 golden IDs, lint 0 errors, build OK.

## What to look at when testing
1. Log a contact attempt with "nicht erreicht", then one with "erreicht": the reach rate tile shows 50 %, with "erreicht ÷ Versuche" written next to it.
2. Book an appointment for tomorrow: it shows **vereinbart** and only offers "abgesagt"/"verschoben". Try "durchgeführt" through the API → rejected.
3. Book one for an hour ago (date today, earlier time): it shows **Ergebnis fehlt** with all four outcomes.
4. As a team leader, open a report's profile/team views: their activities are visible; as a peer they are not.
5. The dashboard tiles compare with the goal only when the goal has that target; otherwise no delta is shown.

## Edge cases & decisions
- **Booked vs held use different dates**: booked counts by creation date, held by slot date. An appointment booked in October for November counts as booked in October and held in November. This is intentional (it matches how people report "Termine gemacht" vs "Termine gehabt") and is written on the page.
- **Rescheduling** marks the old appointment `rescheduled`; the new slot is a new appointment (so no-show/reschedule rates stay countable). The UI doesn't create the follow-up appointment automatically yet.
- Logging today without a time stores "now"; a past date without a time stores 12:00 Berlin.
- An outcome can be changed afterwards (e.g. no_show → held after a late arrival); every change is in the audit log.
- Activities can't be deleted (no DELETE grant). A wrong entry is corrected with a note; deletion with audit can come with the UX clean-up branch if wanted.
- No OD affected. Activity visibility for finance/compliance is **not** granted (operational data, §12).
