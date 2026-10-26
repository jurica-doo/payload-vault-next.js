# r1/p4/leads — lead intake, pipeline, assignment, SLA, duplicates

Branch `r1/p4/leads` → merged into `r1/p4-leads-tasks`.
Spec: §9.1–9.3, §9.5, §11.2 (lead alerts), §14.5 (lead workflow acceptance).

## What was built

**Database** — `supabase/migrations/20261028120000_leads.sql`
| Object | Purpose |
|---|---|
| `lead_stages` | Configurable pipeline (§9.2): Neu → Zugewiesen → Kontaktversuch → Erreicht → Qualifiziert → Termin vereinbart → Termin durchgeführt → Angebot → Gewonnen / Verloren, plus „Später nachfassen“. Each stage has `kind` (open/won/lost/nurture), `required_fields`, `allow_skip`, `active`. |
| `lead_sources`, `lead_source_costs` | Sources (5 seeded) and costs per source and month. Costs are visible to admin and finance only. |
| `leads` | §9.1 fields: identity, source, ownership, qualification (product interest = product category codes, consent basis), pipeline (stage, next action, first contact, SLA deadline, loss reason), conversion (`production_id`, `customer_id` reserved for Phase 5), `merged_into`. |
| `lead_stage_history`, `lead_assignments` | **Append-only** (trigger `append_only`): every stage entry and every owner change with who, when and why. |
| `business_calendar` | Nationwide holidays 2026–2027 seeded; Bundesland rows (e.g. `DE-BY`) can be added. |
| `app_settings.lead_sla` | First-contact hours, working day, workdays, holiday region, escalation. **Provisional (OD-19)** until an admin saves it. |

Visibility (RLS): owner, the owner's managers, admins. Unassigned leads (the pool) are visible to leaders and admins. Finance and compliance get **no** lead access. Every write goes through an RPC; there are no direct table writes. Audit: lead changes are audited with name, phone, email, company and notes **redacted**.

**RPCs**
- `rpc_create_lead(data, owner, to_pool, confirm_duplicates)`
  - Advisers create leads for themselves. Leaders create them for their structure or into the pool. Admins (MFA) create for anyone.
  - If a likely duplicate exists, it fails with `possible_duplicate` unless `confirm_duplicates` is set (§9.5: never silent).
- `rpc_find_lead_duplicates(...)`: matches by the same E.164 phone, the same email, or a similar name (pg_trgm similarity ≥ 0.5). Leads the caller can't see come back **without details**, only "Lead einer anderen Person" and the owner's name.
- `rpc_update_lead(id, data)`: only the keys present are written, and unknown keys are rejected.
- `rpc_set_lead_stage(id, stage, note, loss_reason, next_action, next_action_at, production_id)`:
  - Required fields are checked against the configured stage (`stage_requirements_missing`, with DETAIL listing the fields).
  - Going backwards or reopening a closed lead needs a reason of at least 10 characters.
  - Skipping is blocked when the target has `allow_skip = false`.
  - A linked production record must belong to the lead owner.
- `rpc_assign_lead(id, owner|null, reason)`:
  - The first assignment out of the pool needs no reason; every reassignment does (§9.3).
  - Targets: yourself, someone in your structure, or the pool (leaders). Admins (MFA) can assign to anyone. Advisers can't hand leads to colleagues.
  - Upcoming booked appointments move to the new owner, and the new owner is notified.
- `rpc_merge_leads(keep, merge, reason)`: needs write access to **both** leads.
  - Empty fields are filled from the duplicate, product interest is combined, and the earliest received and first-contact times are kept.
  - Activities move to the kept lead. The duplicate stays as an archived row (`merged_into`) and disappears from lists.
- `rpc_lead_config()`: returns stages, sources, SLA and holidays for the forms.
- Admin (MFA): `rpc_set_lead_sla`, `rpc_update_lead_stage_config`, `rpc_save_lead_source`, `rpc_set_holiday`. Admin or finance (MFA): `rpc_set_lead_source_cost`.

**Automatic behaviour**
- **Activities move leads forward** (trigger on `activities`):
  - contact attempt → Kontaktversuch
  - reached → Erreicht
  - appointment booked → Termin vereinbart
  - appointment held → Termin durchgeführt
  - These moves only go forward, only from open stages, and never past „Termin durchgeführt“. Offer, won and lost stay manual.
- The first contact attempt, call or email sets `first_contact_at`.
- `app_private.check_activity_link` (the hook from the activities slice) now checks that the lead exists, isn't merged, and that the caller may work on it.
- **SLA**: `sla_due_at = add_business_hours(received_at, first_contact_hours)`. It's recalculated for open, uncontacted leads when the SLA or the holidays change.
- **Task generators**: `run_task_generators()` is now the core generators plus `run_lead_task_generators()`. The old function was renamed to `run_core_task_generators`, so the pg_cron job is unchanged.
  - `lead_first_contact`: an owned, open lead without a first contact gets a task for the owner, due at the SLA deadline. Once overdue, the task becomes **high** priority and the manager gets one `lead_sla_breach` notification (if escalation is on).
  - `lead_next_action`: a contacted lead with no next step, or an overdue one, gets a reminder, unless an appointment is already booked.
  - `lead_unassigned`: a pool lead gets a task for its creator if they are a leader, otherwise for every active admin.
  - Each task closes automatically once its cause is gone.

**TypeScript**
- `src/domain/sla.ts`: `addBusinessHours`, which mirrors the SQL. Golden cases **GC-SLA-001…007** are shared with pgTAP: weekend, holidays, DST, before opening, after closing. Parity is now **47** IDs.
- `src/domain/leads.ts`: missing-field check, SLA state, the "needs a reason" rule, and labels.
- `src/hooks/useLeads/useLeads.ts`: config, list, detail, mutations, admin, and source costs.

**UI**
- `/vertrieb/leads`: tabs Meine / Team / Nicht zugewiesen (leaders and admins) / Abgeschlossen; search by name, company, L-number or phone; a stage filter; and an SLA badge (rechtzeitig, verspätet, offen, überfällig).
- „Lead anlegen“: phone and email are normalised (E.164, lowercase).
  - The duplicate check runs before saving and lists the matches. Saving then needs the „Geprüft: andere Person“ checkbox.
  - Leaders choose an owner or the pool.
- `/vertrieb/leads/[id]`:
  - StageStepper; stage change that shows the missing required fields before submit, plus a loss reason and a reason field when needed.
  - Next step; details with an edit dialog; and an OD-19 notice while the SLA is provisional.
  - Assignment with history, the shared `ActivityPanel`, the stage history, and the duplicate check with merge.
- `/admin/leads`: SLA form, the stage × required-field matrix, sources and monthly costs, and holidays. Every change needs a reason; MFA is enforced by the database.
- Notification settings: `lead_next_action`, `lead_assigned` and `lead_sla_breach` can be muted. Task links open the lead.
- German error texts for all new keys.

## Tests
- pgTAP `170_leads.test.sql` (57): SLA golden cases, create/duplicate/validation, the pool, assignment rules, automatic stage moves, required fields, backward moves, appointment transfer, loss of access after reassignment, lost/closed, merge permissions and MFA, append-only history, all three generators with escalation, and SLA admin.
- Vitest: `sla.test.ts` (10), `leads.test.ts` (6), `LeadsPage.test.tsx` (3).
- Totals: 562 pgTAP assertions (18 files), 335 unit tests, 47 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. Turn on the `leads` flag. Create a lead with phone `0170 1234567`, then create another with `+49 170 1234567`: the duplicate warning appears and saving is blocked until you tick the box.
2. As an adviser, create a lead. Log a contact attempt with „nicht erreicht“ in the lead's activity panel: the stage moves to Kontaktversuch and the SLA badge shows „rechtzeitig“.
3. Try „Qualifiziert“ without a product interest: the missing field is named before you submit.
4. As a leader, put a lead in the pool. The adviser doesn't see it. Assign it (no reason needed). Then reassign it: a reason is required, and a booked future appointment moves with it.
5. Create a lead dated 10 days back, then run `select app_private.run_task_generators();` (or the admin button). The owner gets a high-priority „Erstkontakt“ task and the manager gets a notification. Log a call and run it again: that task closes and „Nächsten Schritt festlegen“ appears.
6. In `/admin/leads`, change the SLA to 4 hours: open leads get a new deadline, and the OD-19 notice disappears.

## Edge cases & decisions
- **SLA counts from receipt**, not from assignment. A lead that waits in the pool can therefore be overdue as soon as it's assigned. That is intentional (it's the customer's waiting time), and the pool task is high priority for that reason.
- A lead **without phone and email** is allowed (e.g. a referral note) but flagged in the form; duplicates are then matched by name only.
- **Consent missing**: allowed and shown as „nicht erfasst“. Making it a required field for a stage is an admin setting. Communication rules are Phase 5/6.
- **Won without a linked production record** is allowed by default. Add „verknüpfter Vertrag“ to the „Gewonnen“ stage to enforce it.
- **Stage config** can't deactivate Neu/Gewonnen/Verloren, or a stage that still has leads.
- **Merged leads** are kept, not deleted, so the audit trail stays complete. They're hidden by RLS, and the history on the duplicate notes the merge.
- **Previous owner** loses access after reassignment. Their own activity rows stay theirs, which keeps the activity counts correct.
- **Import of leads** (CSV) is not in this slice. It can reuse the production import wizard later, with every row passing through `rpc_create_lead`.
- Customer conversion (`customer_id`) arrives with Phase 5.
