# Phase 4 — Verification findings

Manual test guide: [r1-p4-manual-guide.md](r1-p4-manual-guide.md).

## Automated checks (2026-11-03, branch `feat/requirements1` @ `ca238e9`)

| Check | Result |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | 0 errors, 2 known warnings |
| `npx vitest run src/views/leads src/views/tasks src/views/activities src/views/dashboard src/domain` | 20 files, 167 tests passed |
| `npm run check:golden` | OK (58 shared case IDs) |
| `npm run test:db -- 150` / `160` / `170` / `180` | 28 / 16 / 57 / 20 assertions passed |

## Browser + API pass (2026-11-03)

Fresh `npm run e2e:prepare`, Chrome (dark + light, 1470 px and 500 px), accounts fa.a@, tl@, tl2@, fb.b@, fb.a@,
admin@ (with and without aal2), finance@, compliance@. Rules that the UI can't reach were checked against the
API with the same RPCs/REST calls the app makes. Volume test: +1,500 leads, +600 tasks (guide §14.1).

**Works as specified** (no finding): phone/email normalisation (`0170 1234567` → `+491701234567`, e-mail
lower-cased); duplicate warning by phone and e-mail, blocks saving until confirmed; hidden duplicates show only
the owner name; adviser can't create for others/pool, assign, or touch peers' leads; Ben, finance and compliance
see no leads/tasks/activities; required fields per stage (`stage_requirements_missing` with field names);
`date_in_future`, `appointment_in_future`, invalid phone, missing name; funnel `all` refused for leaders,
window > 2 years and `from > to` refused; generators idempotent, escalation once to the direct manager,
overdue lead task high priority; first assignment without reason, reassignment needs ≥ 10 chars and moves the
booked appointment ("1 anstehende(r) Termin(e) übertragen."); SLA change to 4 h recalculates open leads
correctly (weekend receipt → Monday 13:00) and removes the OD-19 notice; MFA enforced with a German message;
deactivating a stage that holds leads refused ("In dieser Phase befinden sich noch Leads."); cost per lead in
"Gesamt" (100 € / 3 leads = 33,33 €), cost columns hidden in "Mein Team"; muted kinds really stop
notifications; search stays fast with 1,000 rows (10–30 ms per keystroke); light mode OK; bell fits at 500 px.

## Findings

Severity: high (wrong data / access / blocked flow), medium (misleading or silently wrong), low (polish).
A confirmed bug gets a regression test titled with its ID.

| ID | Area | Steps | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|
| P4-SEC-01 | Pool access | Tim creates a pool lead; Tina (leader of another structure) reads it, edits it, logs a call, assigns it to Fritz | Pool leads stay with the creator's structure (generator `lead_unassigned` and auto-assignment already treat them that way) | Any leader can read full contact data, edit, log activities and take another structure's pool lead, without a reason | high | fixed — `can_see_lead/assert_can_write_lead(owner, created_by)`; pgTAP 270, e2e |
| P4-PERF-01 | Tasks | 600 extra tasks for Ali; app query `order=status,due_at&limit=500` | All open tasks listed | Only **99 of 205** open tasks returned: cancelled/done sort first and fill the limit | high | fixed — open + recent closed tasks in two queries; e2e |
| P4-BUG-01 | Activities | Lead detail → Termin, Uhrzeit `25:99` → Erfassen | Inline error | Saved silently as **tomorrow 02:39** | high | fixed — `TimeInput` (native time) + strict `berlinLocalToUtcIso`; vitest, e2e |
| P4-BUG-02 | Lead settings | `/admin/leads` → Kosten je Monat → Betrag `100,00` → Speichern | Saved | "Ungültiges Format": the German string goes to numeric `p_amount` without `parseGermanDecimal` (`useLeads.ts:137`). Only whole numbers save | high | fixed — `parseGermanDecimal` + inline error; vitest, e2e |
| P4-NOTIF-01 | Generators | 1,500 uncontacted leads → one generator run | Grouped / capped escalation | Tim got **999** and Anna **501** "Erstkontakt überfällig" notifications in one run, plus one `lead_first_contact` notification per task; a future lead import would cause the same | high | fixed — digest per recipient/kind, escalate once; pgTAP 270, e2e |
| P4-DATA-01 | SLA / first contact | Book an appointment (or hold one) on a never-contacted lead, run generators | An appointment implies contact | `first_contact_at` stays empty → "Erstkontakt" task stays open and will escalate even after a held appointment (Bernd, L-00002) | medium | fixed — appointment/offer set first contact + backfill; pgTAP 270, e2e |
| P4-DATA-02 | Analytics | Same leads, `/vertrieb/leads/analyse` Mein Team | One definition of "contacted" | Kontaktquote "3 von 4" next to Erstkontakt "0 von 0 kontaktierten Leads", Ø "–" | medium | fixed — same root cause as P4-DATA-01 |
| P4-DATA-03 | Lead create | Create a lead without Region/Kampagne | NULL | Stored as `''` (region, campaign, referral); Details show an empty Region instead of "–" | medium | fixed — trigger nulls empty texts + backfill; pgTAP 270, e2e |
| P4-PERF-02 | Leads list | 1,506 leads, admin/Tim → Leads | Server paging or a visible "more than 1,000" | Tab shows "Team (1000)", 506 leads silently missing; response 940 KB / ~450 ms | medium | fixed — list columns only, server search/filter, count + notice; vitest |
| P4-UI-02 | Leads search | Team tab → search `0170 1234567` | Lena found | Nothing found (`+49170` works) | medium | fixed — server search with `phoneSearchFragment`; vitest, e2e |
| P4-UI-03 | Lead detail | Details card | German labels | Priorität "high", Produktinteresse "LV" (code), phone ungrouped | medium | fixed — labels, category names, `formatPhone`; e2e |
| P4-UI-04 | Tasks | Tasks request fails | Error block with retry | ~30 s "Wird geladen…" then "Keine offenen Aufgaben." | medium | fixed — ErrorBlock with retry (tasks, activities, source trends); vitest |
| P4-UI-05 | Activities | Anruf, Uhrzeit `abc` → Erfassen | Inline error | Uncaught `RangeError: Invalid time value` (dev overlay), nothing saved, no feedback | medium | fixed — conversion inside try, native time input; vitest |
| P4-UX-07 | Bell | Mute "Lead-Erstkontakt", save, reopen settings | Box ticked | Unticked (DB has the mute); saving again silently un-mutes; no save confirmation | medium | fixed — mutes loaded and pre-ticked, toast on save; vitest, e2e |
| P4-UX-10 | Tasks | Tick a system task (e.g. "Erstkontakt: Lena") done, generators run | Either not allowed or stays closed | Re-created within 15 min with a new notification | medium | fixed — no checkbox; manager dismisses with reason; pgTAP 270, vitest, e2e |
| P4-UX-11 | Pipeline | Book appointment on a lead in "Zugewiesen" | Stepper shows real progress | Kontaktversuch, Erreicht, Qualifiziert shown as done (✓) although never reached and product interest missing | medium | fixed — `StageStepper visited` (skipped stages dashed); vitest, e2e |
| P4-UI-06 | Leads list mobile | 500 px wide | Normal input height | Search input collapses to ~18 px (`flex-1` in `flex-col`, `LeadsPage.tsx:95`) | medium | fixed — kit SearchBar, full width on mobile; e2e |
| P4-UX-12 | Lead create | Duplicate found in the long modal | Warning visible | Warning rendered below the fold; the user only sees the button change to "Trotzdem anlegen" | low | fixed — warning scrolled into view, checkbox focused |
| P4-UX-13 | Lead create | Type phone/e-mail | Validate on blur | Errors show from the first keystroke | low | fixed — `useContactFields` validates on blur |
| P4-UX-04 | Analytics | Admin opens Auswertung | "Gesamt" for admins | Opens "Mein Team" (empty for Erika) → "keine Leads" | low | fixed — derived default scope; vitest, e2e |
| P4-UX-14 | Admin settings | SLA 0 / 401 / `9:00` / start > end | Message why | Save button just disabled; `9:00` refused here but accepted in activity times | low | fixed — `slaErrors` inline messages, time inputs; vitest |
| P4-UX-15 | Admin settings | Save SLA without aal2 | Disabled like the other cards | Button enabled; toast behind the open dialog | low | fixed — disabled without 2FA, errors inside the dialog |
| P4-UX-16 | Stage matrix | Deactivate "Zugewiesen" → refused | Draft resets; dialog text fits | Tick stays cleared after the error; dialog only talks about "Pflichtfelder" | low | fixed — row reset on error, `stageChangeMessage`, „Verwerfen“; vitest |
| P4-UI-07 | Stage matrix | 1470 px | Readable | Columns crammed, names hyphenated ("Zuge-wiesen"), row action wraps to "Spei-chern" | low | fixed — min width, no hyphenation, kit buttons |
| P4-UI-08 | Holidays | Two-column list | "Entfernen" next to its own holiday | Each "Entfernen" sits next to the neighbouring column's date | low | fixed — one row per holiday, paged |
| P4-UX-06 | Several | Lead create, phase change, next step, edit, SLA save | Success feedback | Silent (only assignment shows a toast); reassignment reason has no counter unlike ReasonConfirmForm | low | fixed — success toasts, kit buttons, reason counters |
| P4-UX-17 | Lead detail | Reassign lead with appointment | Activity panel updates | Shows "Noch keine Aktivitäten" until reload | low | fixed — lead mutations invalidate activities |
| P4-API-01 | rpc_create_lead | Payload with unknown key `foo` | Rejected like `rpc_update_lead` | Accepted silently | low | fixed — allow-list on create; pgTAP 270, e2e |
| P4-API-02 | Constraints | notes > 4000, appointment without slot, outcome not fitting, task title < 3 | Named error keys | Raw CHECK violations (UI shows the generic 23514 text); notes/description textareas have no `maxLength` | low | fixed — `text_too_long`, `appointment_time_required`, `outcome_not_allowed`, `title_too_short`; pgTAP 160/270 |
| P4-UI-01 | Tasks | Admin on `/vertrieb/aufgaben` | Button to run generators (per docs) | No button; `rpc_run_task_generators` exists (admin + MFA) | low | fixed — „Generatoren ausführen“ for admins; vitest |
| P4-UX-02 | Leads tabs | Search active | — | Counters ignore search/filter; for admins "Team" means everyone | low | fixed — counters follow filters; „Alle anderen“ for admins without team; vitest |
| P4-UX-03 | Activities page | — | Row links its lead | No lead shown | low | fixed — activity rows link their lead |
| P4-UX-05 | Appointments | "verschoben" | Offer the new slot | Two steps (known open item) | low | fixed — „verschoben“ books the new slot in one dialog |
| P4-UX-08 | Appointments | no_show → held | Possible in UI (docs) | Chips only while no outcome; API allows it | low | fixed — „Ergebnis ändern“ menu for past appointments |
| P4-UX-09 | Tasks | Due date in the past | decide | Allowed | low | fixed — due date min = today for new tasks |
| P4-NOTE-01 | Lead numbers | Failed creates | Gap-free L-numbers | Identity consumed by failed inserts (L-00004, -05… missing) | low | won't fix — identity gaps are normal Postgres behaviour |

**Not an app finding:** after the client-side redirect from `/login`, the Chrome extension's synthetic clicks
sometimes stopped reaching the page (JS clicks still worked; a reload fixed it). Treat as a test-tool artefact.

## Fixes (2026-11-03)

All findings above are fixed except P4-NOTE-01 (won't fix). Database changes are in
`supabase/migrations/20261101100000_phase4_review_fixes.sql`, regression tests in
`supabase/tests/270_phase4_review_fixes.test.sql` (28 assertions), `e2e/tests/phase4-leads-tasks.spec.ts`
(13 tests) and the vitest files next to the changed views and components (each titled with its ID).
Decisions taken with the user: pool leads belong to the creator's structure; appointments and offers count as
first contact; generators send one digest per recipient and kind; system tasks close themselves (managers may
dismiss with a reason).

## Round 2

Guide: [r1-p4-manual-guide-round2.md](r1-p4-manual-guide-round2.md). New findings get IDs P4-R2-xx.

Browser pass 2026-11-03 (Chrome, 1,470 / 1,084 / 500 px, dark and light), as Ali and compliance.
Works: login error and redirect; lead form with emoji, `ß`, RTL company, HTML/script in names and notes
(rendered as text, page title untouched, line breaks kept); validation on blur; keyboard selection in dropdowns;
e-mail trimmed and lower-cased; lead and customer detail without horizontal overflow at 500 px.

| ID | Area | Steps | Expected | Actual | Severity | Status |
|---|---|---|---|---|---|---|
| P4-R2-01 | All create forms | Lead anlegen → fill → **double-click** „Lead anlegen“; same on „Erfassen“ in the activity form | One record | **Two identical leads** (L-00211/L-00212, 13 ms apart; the duplicate check can't see the parallel insert) and two activities, two toasts each. The kit Button only disables after the pending state renders | high | fixed — kit `Form` (ref guard, pending context for submit buttons) and `Button` (ignores clicks while an async onClick runs); all 19 forms; vitest, e2e |
| P4-R2-02 | Lead detail | Log a contact attempt on a lead in „Zugewiesen“ | Stepper, SLA badge and Verlauf update | Stay on „Zugewiesen“ / „offen“ until reload (DB already moved to Kontaktversuch); `useActivities.log` doesn't refresh the lead | medium | fixed — activity mutations refresh lead, leads, tasks, customer; e2e |
| P4-R2-03 | Leads list | Window ≈ 1,080 px | Readable cells | Short words hyphenated („Zuge-wiesen“, „Web-site“), names broken mid-word, horizontal scroll for 7 columns | low | fixed — no automatic hyphenation in DataTable cells (wide tables scroll) |
| P4-R2-04 | Session expiry | Task dialog open, session ends, Speichern | Redirect, dialog closed, „Sitzung abgelaufen“ | Redirect worked, but the dialog stayed open over the login page and the toast said „Dafür fehlt Ihnen die Berechtigung“ | medium | fixed — dialogs close on route change; refusals after sign-out map to the session text; vitest |
| P4-R2-05 | Search | Search `_` | Literal underscore | Matched every lead (ILIKE wildcard) | low | fixed — `_` escaped in lead and customer search; vitest |
| P4-R2-06 | Duplicates | Two parallel `rpc_create_lead` with the same phone (two users, imports) | One lead + `possible_duplicate` | Both created — the check didn't see the other uncommitted row | medium | fixed — advisory lock per phone/e-mail (migration `20261101120000`, also customers); e2e |

Round 2 re-test (2026-11-03, after the fixes): double-click and double Enter create one record (lead, activity,
task, customer); the lead page shows the new stage, SLA and history right after logging; an expired session closes
the dialog and says „Ihre Sitzung ist abgelaufen“; search with `% _ , ( ) * \ ' < emoji`, 300 characters → no error;
parallel conversion → one customer (`already_converted`); parallel reassignment → applied in order, both audited.
