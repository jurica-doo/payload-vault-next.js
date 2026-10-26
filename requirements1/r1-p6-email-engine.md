# r1/p6/email-engine — campaigns, send-time checks, logs, kill switch

Branch `r1/p6/email-engine` → merged into `r1/p6-automation`.
Spec: §10.2 (schedule, pause, send window, suppression, test mode, logs, kill switch, approval), §10.5, §14.6 (acceptance).

## What was built

**Database** — `supabase/migrations/20261030110000_email_engine.sql`

| Object | Purpose |
|---|---|
| `app_settings.email` | **Global kill switch, `enabled = false` by default.** Also the send window (Berlin time, 09–18, every day) and a daily limit (500). Only **admins** can switch it on; admins **and compliance** can always switch it off. Both need a reason. |
| `email_campaigns` | `birthday` (runs daily) or `one_off` (a date, e.g. Christmas). Lifecycle draft → submitted → **approved by a second person** → active ⇄ paused → completed / cancelled. **Approval pins the template version**; later template edits don't change what an approved campaign sends. |
| `email_suppressions` | Addresses that never receive automated mail (opt-out, bounce, complaint, invalid, manual). Lifting a block needs a reason, and the addresses are redacted in the audit log. |
| `email_send_log` | **One row per attempt, including suppressed ones with their reason.** Fields: legal basis used, provider id, attempts, error code (never message content), mode live/test. **Idempotent**: one live row per (campaign, customer, occasion date). |

**Checks.** For every send, `app_private.email_block_reason` checks in this order:
1. `may_contact` for the template's consent purpose: customer active, no opt-out, address present (and a birth date for birthday mail), consent not withdrawn.
2. The legal basis is one the **template accepts**.
3. The address isn't on the suppression list.
4. Every merge field has a value, so no „Liebe ,“ mails.

**Flow**
1. **Planning.** `app_private.plan_email_sends()` (cron, hourly, idempotent) does nothing while the switch is off. Otherwise it plans today's occasions:
   - Birthdays; 29 Feb birthdays are sent on 28 Feb in common years.
   - One-off campaigns on their date, after which the campaign is marked completed.
   - Each candidate is logged as `queued` or `suppressed` with its reason.
2. **Claiming.** `rpc_claim_email_sends(limit)` (service role only) **checks everything again at send time**:
   - **Release conditions**: the switch, the window and the daily limit.
   - **Campaign state**: a paused campaign keeps its rows waiting; a cancelled one marks them `suppressed`.
   - **Expiry**: an occasion that has passed is marked `expired`, so no birthday mail arrives days late after a pause.
   - **Consent and data**: consent, basis, suppression and merge fields are checked again. A consent withdrawn after planning → `suppressed: withdrawn`.
   - **Crash recovery**: rows stuck in `sending` for more than 15 minutes return to the queue. The log id is the provider idempotency key.
   - **Output**: rendered subject, text and HTML from the **pinned** version.
3. **Reporting.** `rpc_report_email_result(id, ok, provider_id, error)`: a failure goes back to the queue, and after 3 attempts the row is `failed`.
4. **Provider events.** `rpc_record_email_event(provider_id, delivered|bounced|complaint)`: a bounce or complaint adds the address to the suppression list.

**Test mode.** `rpc_send_test_email(version)` sends only to the requesting officer's own address, with a „[TEST]“ subject and sample data, and is rate-limited. It works while the switch is off, so content can be checked before activation.

**Erasure** (privacy-ops) also removes the address from the send log (trigger). Advisers see the send history of customers they may see (§10.1); officers see everything.

**Scheduling.** `app_private.schedule_email_jobs()` schedules the planner with pg_cron (run it once, like the task jobs).

**Edge Functions**
- `supabase/functions/send-emails`: called by a scheduler with `x-cron-secret` (constant-time comparison).
  - **Without a configured provider it exits before claiming anything** (OD-11).
  - Provider adapters live in `provider.ts`. Only `dryrun` exists, for staging; the chosen provider is one more adapter. Only error class names are logged.
- `supabase/functions/email-events`: provider webhook with `x-webhook-secret`, a size limit and payload validation. Once the provider is chosen, verify its signature there.

**Frontend** (`/vertrieb/kunden/kommunikation`)
- **Automatischer Versand**: state, last-7-days counts, stop/start (start for admins only, with an OD-11 / Gate E notice), and the send window and daily limit.
- **Kampagnen**: create (birthday or dated), submit → approve or return by someone else → pause/resume/cancel (with reason). The pinned template version is shown.
- **Templates**: „Testmail an mich“ for the active version.
- **Sperrliste**: block an address; lifting a block needs a reason.
- **Versandprotokoll**: filter by status, with readable suppression reasons.
- Customer page: „Automatische E-Mails“ history, including why a mail was not sent.

## Tests
- pgTAP `250_email_engine.test.sql` (27), using a calendar-independent birthday setup:
  - **Campaigns and switch**: one-off date validation; four-eyes on campaigns; version pinned on approval; switched off by default (no planning, no log); compliance can't switch on.
  - **Planning**: everyone with a birthday logged; queued vs `no_legal_basis` / `basis_not_allowed` / `suppressed_address` / `missing_merge_field`; no mail without a birthday; planning twice creates no duplicates.
  - **Sending**: users can't claim; exactly one mail goes out, rendered from the pinned version; a **consent withdrawn after planning is suppressed at send time**; the result is recorded; a bounce goes on the suppression list.
  - **Pause, expiry, erasure, visibility**: while paused only the test mail is released, and only to the requester; history is kept while paused; late mails expire; erasure removes the address from the log; advisers see their customers' history; peers see none.
- Totals: 750 pgTAP assertions (26 files), 363 unit tests, 58 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. On the Kommunikation page the switch shows „ausgeschaltet“, and compliance has no „einschalten“ button.
2. Create a birthday template (approved by someone else), then a birthday campaign (also approved by someone else). The campaign shows „Vorlage v1“. Edit the template to v2 and approve it: the campaign still shows v1.
3. On staging, set `EMAIL_PROVIDER=dryrun`, `EMAIL_FROM`, `EMAIL_CRON_SECRET`; switch on; call `send-emails` with the secret. The log shows „gesendet“ for customers with consent and a birthday today, and „nicht gesendet – keine Rechtsgrundlage“ for the others.
4. „Testmail an mich“ appears in the log as Test.

## Edge cases & decisions
- **No provider = no sending.** OD-11 (EU hosting, DPA) must be decided, then Gate E (templates, legal bases, suppression, approvals verified), and only then does an admin switch it on.
- One-off campaigns plan everyone and log suppressed rows for customers without a basis. That is deliberate (§14.6: every attempted send is logged), and the log shows how many could actually be reached.
- One mail per customer per campaign and occasion, so a customer on two birthday campaigns would get two mails. Keep one active birthday campaign (not enforced, noted for clean-up).
- The daily limit counts live mails claimed today (Berlin). Test mails don't count.
- Holidays use one-off campaigns with a date. A recurring holiday calendar can come later.
