# Requirements 1: what still needs to be checked and solved

Everything from the specification is built, tested in the database harness and merged into `feat/requirements1`.
Nothing has been applied to production, and nothing has been clicked through **signed in**, because there is no staging project yet.
This list covers everything between "built" and "live", in the order it is best done.

Status at the time of writing (2026-10-30):
- 44 migrations
- 766 pgTAP assertions in 27 files
- 366 unit tests
- 58 golden cases shared by the SQL and TypeScript engines
- CI green
- Every module behind a feature flag that is **off**
- Email sending switched **off**

Legend: **[You]** = needs the account owner or a Profina decision · **[Dev]** = code work for the clean-up branch · **[Both]** = a decision followed by a small code or config change.

---

## 1. Infrastructure and setup [You]

### 1.1 Environment
- [ ] **Create a staging Supabase project.** This is the prerequisite for almost everything below.
  - Use synthetic data only, never a production export (§12.4).
  - Link it to a Vercel preview environment for `feat/requirements1`.
- [ ] **Get a working Supabase CLI.** The npm binary is killed by macOS (exit 137); `brew install supabase/tap/supabase` usually works. Alternatively, use the dashboard for the steps below. Tests and type generation already work without it, through the Docker harness.
- [ ] **Vercel:** remove `NEXT_PUBLIC_ALLOWED_EMAILS` once the invite flow is live. It is obsolete since Phase 1; signup is invite-only.

### 1.2 Database (staging first, production at the gate)
- [ ] Apply all migrations in order (`supabase db push`, or the SQL editor in timestamp order).
  - From `20261026150000` on, nobody can sign up without an invite.
  - Existing vault accounts keep working and stay "vault-only" until an employee record with the same email exists.
- [ ] Make yourself admin: `select app_private.bootstrap_admin('<your email>');`
- [ ] **Auth settings:**
  - Providers → Email → switch "Allow new users to sign up" **off**.
  - URL Configuration → add `https://<app>/update-passwort`.
  - MFA → TOTP enabled.
- [ ] **Enable pg_cron**, then run once:
  - `select app_private.schedule_jobs();` (task generators every 15 minutes)
  - `select app_private.schedule_email_jobs();` (email planner hourly; it does nothing while sending is off)
- [ ] Run the Supabase **Security Advisor** and **Performance Advisor** after the push. Expected result: clean, apart from the extensions in the `extensions` schema.

### 1.3 Edge Functions
| Function | Purpose | Secrets | When |
|---|---|---|---|
| `invite-employee` | Admin invites employees | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN` (already set) | Before onboarding anyone |
| `send-emails` | Delivers queued customer mail | `EMAIL_CRON_SECRET`, `EMAIL_PROVIDER` (`dryrun` on staging), `EMAIL_FROM`, plus the URL and service key | Gate E |
| `email-events` | Provider webhooks (bounces) | `EMAIL_WEBHOOK_SECRET` | Gate E |

- [ ] Deploy `invite-employee`, then invite yourself a test employee.
- [ ] On staging: deploy `send-emails` with `EMAIL_PROVIDER=dryrun`, and schedule it (Supabase scheduled function, or pg_net + cron) every 10 minutes with the header `x-cron-secret`.

### 1.4 First data
- [ ] Log in, set up 2FA at `/profil/sicherheit`. Admin, finance and compliance actions all require it.
- [ ] `/admin/mitarbeiter`: create employees, give the `finance` / `compliance` roles, set each person's **initial career level**.
- [ ] `/admin/hierarchie`: build the reporting lines (with effective dates).
- [ ] SQL: `select public.rpc_generate_all_periods();` (career periods for everyone).
- [ ] `/admin/regeln`: check the seeded rule version (levels, rates, LV ÷ 4000 / KV ÷ 28 / Sach ÷ 200, reserve 10 %, AE = P × 28).
- [ ] `/admin/leads`: lead sources, SLA (OD-19), Bundesland holidays.
- [ ] Turn on feature flags **one module at a time** (`app_settings.feature_flags`). `sales` must be on as well:
  - `production`, `career`, `team`, `commission`, `goals`, `tasks`, `leads`, `customers`, `admin`.

---

## 2. Decisions Profina has to make [You → Both]

Every one of these is implemented with a **provisional** rule, marked in the code and, where users see it, in the UI with an "OD-xx" notice. After an answer, the clean-up branch changes the setting or the rule, removes the notice, and updates the matching golden cases.

| ID | Question | Built provisionally as | What changes after the answer |
|---|---|---|---|
| OD-01 | Career period boundaries and timezone | `[start, end)`, Europe/Berlin | Golden cases GC-PERIOD |
| OD-02 | Transition period; carry-over of surplus points | Separate transition period; no carry-over | Period generator + simulator |
| OD-03 | Does KV count in the total? KV check before or after the cap? | KV counts; checked after the cap, proportionally | `compute_qualification` + TS mirror |
| OD-04 | What is "one structure"; from which level does the 50 % cap apply | Each direct report's subtree; cap when the target is OL or above | Same |
| OD-05 | Full differential rate matrix and attribution | Rate-compression walk (reproduces all §5.3 examples) | `rate_pairs` table / `commission_split` |
| OD-06 | LV term over 35 years | Formula uses min(term, 35); real term stored | Conversion rule |
| OD-07 | Precision and display of points/AE | 4 decimals stored, 2 shown, AE as an integer | Formatting only |
| OD-08 | When is a contract "eligible" (submitted / issued / paid)? | Manual status `eligible` set by an authorised user | Production workflow / import |
| OD-09 | Subsidy pro-rating, pausing, reclaim; approver | Manual approved amount; admin/finance approve | Subsidy RPCs |
| OD-10 | Reserve release and clawback | Withheld only; release/clawback manual | New ledger entry kinds |
| OD-11 | **Email provider** (EU hosting, DPA) | None; sending disabled | Provider adapter + webhook signature (**Gate E**) |
| OD-12 | Which rule version applies (production or approval date) | Production date | Rule lookup |
| OD-13 | Who may see customers | Adviser + managers; admin and compliance read all; finance none | RLS helper `can_see_customer` |
| OD-14 | **Contract portal**: which system, API/export/webhook? | Manual links; service-role intake ready | Small adapter Edge Function |
| OD-15 | Promotions automatic or approved? | Approved by an admin from the "ready" queue | Promotion workflow |
| OD-16 | **Retention periods** per data class | Nothing deleted automatically; report only | `app_settings.retention` |
| OD-17 | May leaders see their team's commission amounts? | Off | `app_settings` switch |
| OD-18 | Remuneration for Strom/Gas/Kfz | Out of scope; 0 P / 0 AE | Conversion rules |
| OD-19 | Lead first-contact SLA (hours, working day, region) | 8 business hours, Mon–Fri 09–17, nationwide holidays, from receipt | `/admin/leads` (no code) |

Design choices that weren't asked in the spec, but should be confirmed:
- [ ] Lead SLA counts from **receipt**, not from assignment (a lead waiting in the pool can be overdue when it's assigned).
- [ ] Lead analytics attribute leads to their **current** owner (owner at receipt is possible; the history exists).
- [ ] Booked appointments count by **creation date**, held appointments by **slot date**.
- [ ] Compliance reads full customer profiles (needed to judge consents).
- [ ] Erasure **pseudonymises**: contracts, production and commission are kept without the person's details.
- [ ] Email templates accept **consent only** as legal basis by default. Which templates may use legitimate interest is for the privacy contact to decide.
- [ ] Customers with no recorded legal basis get no automated mail (a one-off campaign logs them as "not sent – keine Rechtsgrundlage").

---

## 3. Delivery gates (§15)

| Gate | Condition | Status | What's left |
|---|---|---|---|
| A | Profina signs off the rules (OD-01…08, 12, 15) | ⏳ | Section 2 |
| B | Calculation tests green in both engines (points, AE, periods, KV, cap, reserve, differential) | ✅ | Re-run after each OD change |
| C | ≥ 10 real anonymised cases reconciled with Profina's manual calculation | ⏳ | Staging + real cases; compare statements line by line |
| D | RLS and audit test suite green + **external access review** before live customer data | ⏳ tests ✅ | Profina's privacy contact reviews section 5 |
| E | Templates, legal bases, suppression and approvals verified before email sending | ⏳ | OD-11, then the Gate E list in `phase-6-automation/r1-p6-automation.md` |
| F | Pilot with selected users | ⏳ | Choose a pilot team; flags on for them first |

**Merge to `main`**: only after Gate A (and B, which is already met). Then deploy in the order of section 1.2, with flags still off, and switch on module by module.

---

## 4. Manual test plan on staging (signed in) [You]

Every slice note has a "What to look at when testing" section with exact steps. Below are the end-to-end walkthroughs that touch several modules. Use one browser profile per persona:
- **Admin** with MFA
- **Finance** with MFA
- **Compliance** with MFA
- **DL**, **TL** and two **FA**s in one structure
- One **peer** FA in a different structure
- One **vault-only** user

- [ ] **Onboarding:** admin invites FA → FA accepts and sets a password → sees only the enabled modules. The vault-only user sees only the vault.
- [ ] **MFA:** every admin, finance or compliance action without 2FA shows the MFA notice and is refused.
- [ ] **Production → points → career:**
  1. FA enters LV 100 €/35 years (preview 10,5 P), KV 700 € (25 P, KV), Sach 1.000 € (5 P) and Kfz (0 P).
  2. An authorised user marks them eligible.
  3. Career progress, the KV track and the structure cap update.
  4. The "Woher kommt diese Zahl?" breakdown matches.
- [ ] **CSV import:** a file with good and bad rows (wrong period, negative premium, duplicate id) → errors listed per row, nothing half-imported.
- [ ] **Commission:**
  1. An eligible contract creates personal and differential ledger entries for the FA, TL and DL (example: 560 / 56 / 504 and 280 / 28 / 252).
  2. Finance closes the month: reviewed → approved → paid.
  3. A cancellation after approval lands as a reversal in the next open month.
- [ ] **Subsidy:** above the level maximum → only with an exception reason.
- [ ] **Hierarchy change:** a transfer with a future date → past statements unchanged; the new manager gets differential only from the effective date.
- [ ] **Goals:** FA submits → TL approves or returns with a comment → the dashboard shows actual vs goal, including appointments and offers.
- [ ] **Coaching:**
  - TL writes a private note: the DL sees it.
  - FA, finance, compliance and admin do **not** see it.
- [ ] **Tasks:** manual task to an FA; overdue → shown on top; deactivate the owner → the task moves to the manager.
- [ ] **Leads:**
  1. Create a lead twice with the same phone number → duplicate warning.
  2. TL assigns from the pool, then reassigns with a reason; the appointment moves with the lead.
  3. Log a contact attempt → the stage moves forward.
  4. "Qualifiziert" without a product interest → the missing field is shown.
  5. Lost without a reason → refused.
  6. The SLA overdue task, and the manager notification.
- [ ] **Lead analytics:** every percentage shows "x von y"; costs only in "Gesamt".
- [ ] **Customers:**
  1. Convert a lead → the customer keeps its source.
  2. Record a consent (evidence required), a withdrawal and an opt-out → "Kontakt erlaubt?" follows.
  3. Link a contract; dates only with the confirmation box.
  4. A service item for the renewal → task before the due date.
- [ ] **Privacy (compliance, MFA):**
  - Access request → JSON export downloaded and logged.
  - Erasure request → customer and lead pseudonymised; contracts kept; tasks no longer show the name.
- [ ] **Email (dryrun):**
  1. Template → second-person approval; birthday campaign → second-person approval.
  2. Switch on (admin) and run `send-emails`.
  3. The log shows sent and suppressed rows with reasons; a withdrawn consent stops the mail at send time.
  4. Switch off → nothing more goes out.
- [ ] **Mobile (360 px):** dashboard, lead list, lead detail, customer detail, tasks and the `/dev/ui` showcase.
- [ ] **Dark/light mode** on the same pages.

---

## 5. Security and privacy review (Gate D) [You, with the privacy contact]

What the tests already prove (pgTAP), and what a reviewer should look at:
- [ ] **RLS role matrix:** anon / peer / manager / ancestor / finance / compliance / admin with and without MFA, on every table. Proven per module in files 000–260.
- [ ] **No direct writes:** `authenticated` has no INSERT/UPDATE/DELETE on any sales table; every write goes through `SECURITY DEFINER` RPCs with `search_path = ''`. Verify with the `role_table_grants` query from `check.md`.
- [ ] **Append-only:** audit events, ledger, career history, stage/assignment histories, consents, export log.
- [ ] **Audit redaction:** customer and lead PII, consent evidence, notes, task and service titles. Test: "the audit log never contained the name".
- [ ] **Service-role-only functions:** contract sync intake, email claim/report/webhook. Users get `42501`.
- [ ] **Exports:** privacy export rate-limited and logged.
  - Open: production CSV export is still browser-side and not logged (section 6.2).
- [ ] **Vault isolation:** no leader, admin or finance user can read anyone else's vault (`000_baseline_security`).
- [ ] **Edge Functions:** JWT check (invite), shared secrets compared in constant time (email), no message content in logs.
- [ ] **CSP:** unchanged (nonce-based); no new external origins in the browser. Email and the portal only talk server-side.
- [ ] **Data subject requests:** one-month deadline visible; erasure keeps business records. The legal basis for keeping them is to be confirmed by Profina.
- [ ] **Retention (OD-16)** decided and entered.
- [ ] Penetration/review notes recorded, and the findings fixed in the clean-up branch.

---

## 6. Clean-up backlog [Dev]

### 6.1 UX pass (agreed: "UX later")
- [ ] Signup/invite wording; the "Database error saving new user" text on `/signup` (kept on purpose for now). Retire `/signup` in favour of the invite-only flow.
- [ ] Empty states and wording review across all new pages.
- [ ] Mobile layout of the admin stage × required-field matrix (`/admin/leads`).
- [ ] Navigation entries for the new sub-pages (Aktivitäten, Lead-Auswertung, Kommunikation, Datenschutz are reachable via links only).
- [ ] Finance/admin users without an employee record have no `/vertrieb` dashboard. Decide whether they get one.

### 6.2 Functional gaps
- [ ] Production CSV and other exports through a logging RPC (`export_log`).
- [ ] CSV import for **leads** and **customers** (reuse the production import wizard; every row through the existing RPCs with duplicate checks).
- [ ] Correction form for eligible production (today: cancel + new entry).
- [ ] Leaders entering production for their team. Business decision first.
- [ ] Reserve release/clawback entries (OD-10) and a payment/payroll export.
- [ ] Leader team-statement page (only if OD-17 is switched on).
- [ ] Rescheduling an appointment creates the follow-up appointment automatically.
- [ ] Automatic reassignment queue for **customers** of deactivated advisers (tasks and leads already move).
- [ ] "Missing in last sync" detection for contracts (after OD-14).
- [ ] Per-kind lead times and more recurrence options for service items.
- [ ] Only one active birthday campaign (enforce it, or deduplicate per customer per day).
- [ ] Recurring holiday calendar for greetings (today: one dated campaign per holiday).
- [ ] Optional full login ban on deactivation (today: data access ends, the auth account stays).

### 6.3 Configuration that is fixed in code today
- [ ] Trend prompt thresholds (80 %, 1.25×, minimum 10 leads, 5 overdue tasks) → `app_settings`.
- [ ] Coaching prompt thresholds (Phase 3) → `app_settings`.
- [ ] Customer service lead time per kind.

### 6.4 Technical
- [ ] 5 old lint warnings in untouched components (`Dropdown`, `HeaderHome` images, `DeleteIcon`, `SearchBar`).
- [ ] Performance check on staging with synthetic volume (5k employees / 200k production rows): dashboard and analytics RPCs < 300 ms p95 (plan §10).
- [ ] End-to-end tests (Playwright) for the walkthroughs in section 4.
- [ ] `ubuntu-latest` moves to Ubuntu 26 in CI (GitHub notice); pin the runner if anything breaks.
- [ ] `supabase/seed.sql` with synthetic personas for staging (one per role and level).

---

## 7. Where everything is

| Folder | Content |
|---|---|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | The plan, architecture, security model and the OD register |
| [phase-0-groundwork/](phase-0-groundwork/) | Tooling, UI kit, app shell |
| [phase-1-foundation/](phase-1-foundation/) | Audit, identity/roles, hierarchy, rules, production, career engine. The **production rollout runbook** is in `r1-p1-identity-roles.md` |
| [phase-2-commission/](phase-2-commission/) | Rate matrix, ledger, statements, subsidy, finance UI |
| [phase-3-cockpit/](phase-3-cockpit/) | Goals, dashboards, career progress, profiles/coaching, forecast |
| [phase-4-leads-tasks/](phase-4-leads-tasks/) | Task engine, activities, leads, lead analytics |
| [phase-5-crm/](phase-5-crm/) | Customers, consent, contract links, service reminders, privacy ops |
| [phase-6-automation/](phase-6-automation/) | Email templates, email engine, advanced analytics |

Each phase folder has one summary (`r1-pN-<phase>.md`) and one note per slice, with what was built, the tests, what to look at, and the edge cases.
