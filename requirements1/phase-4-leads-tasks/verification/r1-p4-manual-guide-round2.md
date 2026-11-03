# Phase 4 — Test round 2 (after the review fixes)

Round 1 ([r1-p4-manual-guide.md](r1-p4-manual-guide.md)) found 36 issues; all are fixed (see
[r1-p4-verification.md](r1-p4-verification.md)). This round has two parts:

- **Part A** — confirm every fix in the real app (one box per finding).
- **Part B** — hunt for problems round 1 did not look at: concurrency, sessions, time zones, odd input,
  security, volume, accessibility.

Record anything new in `r1-p4-verification.md` → "Round 2" with IDs **P4-R2-01, -02, …**
(steps, expected, actual, severity). A confirmed bug later gets a regression test titled with that ID.

---

## 0. Setup

```bash
npm run e2e:prepare          # WIPES the local DB, fills the Phase 1 people (see round 1, §0)
npm run dev
alias pvsql='docker exec -i supabase_db_payload-vault psql -U postgres'
npm run totp -- admin@test.com
```

**Automated first** (all must be green before you start clicking):
```bash
npm run typecheck && npm run lint && npm test && npm run check:golden
npm run test:db                                   # 28 files, incl. 270_phase4_review_fixes
npx playwright test e2e/tests/phase4-leads-tasks.spec.ts   # 13 tests, one per fixed finding
```

**Run the generators on demand:** as admin with 2FA → `/vertrieb/aufgaben` → **Generatoren ausführen**
(run generators), or `pvsql -c "select app_private.run_task_generators();"`.

Cast as in round 1: Ali (fa.a@) adviser · Anna (fb.a@) his manager · Tim (tl@) leader · Ben (fb.b@) peer ·
Tina (tl2@) other structure · Dora (dl@) top · admin@ · finance@ · compliance@ · vault@.

---

## Part A — Re-check every fix

### A1. Security and data
- [ ] **P4-SEC-01** Tim creates a pool lead (**Lead anlegen** → **Noch nicht zuweisen (Pool)**).
  Tina: not in her list; its URL → "nicht gefunden oder keine Berechtigung"; duplicate check with the same
  phone → "Lead einer anderen Person" only. Dora (Tim's manager) sees it; Ali does not; admin does.
- [ ] **P4-DATA-01/02** Ali books an appointment on a fresh lead → Details **Erstkontakt** "rechtzeitig" with a
  time; after the generators no "Erstkontakt: …" task. Auswertung: "Kontaktquote" and "Innerhalb der Frist"
  count the same leads.
- [ ] **P4-DATA-03** Create a lead without Region/Kampagne → Details show "Region –".
- [ ] **P4-API-01/02** (API, see the e2e spec) unknown field, notes > 4,000 characters, appointment without
  time, task title "ab" → German messages, never "Bitte prüfen Sie Ihre Eingaben (Format…)".

### A2. Tasks and notifications
- [ ] **P4-NOTIF-01** Ali creates 5 leads with **Eingegangen am** 10 days ago → run generators → Ali's bell:
  **one** "Erstkontakt: 5 neue Einträge"; Anna's bell: **one** "5 Erstkontakte im Team überfällig" → click →
  `/vertrieb/leads` opens on **Team** with **Nur überfällige** ticked. Run again → no new notifications.
- [ ] **P4-UX-10** System tasks have no checkbox, text "schließt sich automatisch". Anna (manager) → Team →
  **⋯** → **Ausblenden…** → reason < 10 characters refused → valid reason → gone, and not back after the
  next generator run. Ali cannot dismiss his own.
- [ ] **P4-PERF-01** With many closed tasks (e2e spec inserts 600) every open task is listed; the closed
  section says "letzte 90 Tage".
- [ ] **P4-UX-07** Bell → ⚙ → tick "Lead-Erstkontakt" → **Speichern** → toast "Einstellungen gespeichert" →
  reopen ⚙ → still ticked.
- [ ] **P4-UI-04** DevTools → Network → block `*rest/v1/tasks*` → reload `/vertrieb/aufgaben` → error box with
  **Erneut versuchen** (retry), not "Keine offenen Aufgaben". Same for the activity list (block `*activities*`).
- [ ] **P4-UI-01** Admin with 2FA: **Generatoren ausführen** → toast with counts. Without 2FA: button disabled.
- [ ] **P4-UX-09** **Aufgabe anlegen** → **Fällig am** cannot be before today; title "ab" shows an inline error.

### A3. Leads list and detail
- [ ] **P4-UI-02** Search `0170 1234567`, `+49 170 1234567`, `0049170…`, `L-00001`, `1`, part of a name.
- [ ] **P4-PERF-02** With > 1,000 leads (Part B §B9): notice "Es werden die neuesten 1.000 von N Leads
  angezeigt"; searching still finds leads outside the newest 1,000.
- [ ] **P4-UX-02** Tab counters change with search, phase and "Nur überfällige". Admin without a team: second
  tab is "Alle anderen".
- [ ] **P4-UI-06** 390 px wide: search field full height, filter controls stacked.
- [ ] **P4-UI-03** Details: "+49 170 1234567", category names, "hoch/normal/niedrig", "–" for empty values.
- [ ] **P4-UX-11** A lead moved by an appointment straight from "Zugewiesen" → the stages in between are
  dashed with "(übersprungen)" for screen readers; "Neu" is not marked skipped for a lead created as
  "Zugewiesen".
- [ ] **P4-UX-12/13** Lead anlegen: phone `abc` → error only after leaving the field; duplicate → warning
  scrolls into view, checkbox focused.
- [ ] **P4-UX-06** Toasts after: lead created, phase changed, next step planned, lead edited, merged, assigned
  (names the new owner). Reason fields show "n Zeichen, mindestens 10".
- [ ] **P4-UX-17** Reassign a lead with a booked appointment → the activity panel updates without reload.

### A4. Activities
- [ ] **P4-BUG-01 / P4-UI-05** All time fields are time pickers (activity, next step, SLA start/end); no way to
  enter `25:99` or `abc`.
- [ ] **P4-UX-05** Future appointment → **verschoben** → dialog "Termin verschieben" → new date/time → old one
  "verschoben", new one "vereinbart", one toast.
- [ ] **P4-UX-08** Past appointment with outcome → **⋯ Ergebnis ändern** → "Ergebnis: durchgeführt" works.
- [ ] **P4-UX-03** `/vertrieb/aufgaben/aktivitaeten`: rows linked to a lead show "Lead: Name (L-…)" as link.

### A5. Admin and analytics
- [ ] **P4-BUG-02** `/admin/leads` → Kosten je Monat → `1.234,50` → saved as 1.234,50 €; `abc` → inline
  error; empty → "Kosten entfernt".
- [ ] **P4-UX-14** SLA: `0`, `401`, start after end, no weekday, region `XY` → message under each field.
- [ ] **P4-UX-15** Without 2FA: SLA, auto-assignment, stage, source and holiday buttons disabled; with 2FA a
  refused save shows its error inside the dialog.
- [ ] **P4-UX-16 / P4-UI-07** Untick "Aktiv" for "Zugewiesen" → dialog says "Die Phase wird deaktiviert…" →
  refused → the tick is back. **Verwerfen** resets a row. Matrix readable at 1,440 px, no "Spei-chern".
- [ ] **P4-UI-08** Holidays: one per row, "Entfernen" next to its own date, paged.
- [ ] **P4-UX-04** Admin opens Auswertung on **Gesamt**; Tim on **Mein Team**; Ali on **Meine Leads**.

---

## Part B — New edge-case hunt

Each block: what to try, what should happen. Anything else is a finding.

### B1. Two people, same record (concurrency)
- [ ] Tim and Anna open the same lead in two browsers; both reassign it within seconds → the second gets a
  clear German error or a sensible result; history shows both steps; never two owners.
- [ ] Ali edits the lead (dialog open) while Tim changes the phase → Ali saves → Ali's edit doesn't revert
  Tim's phase.
- [ ] Two admins merge A→B and B→A at the same time → one succeeds, the other gets "zusammengeführt".
- [ ] Double-click every primary button (Lead anlegen, Erfassen, Zuweisen, Phase setzen, Planen, Speichern,
  Zusammenführen, Generatoren ausführen) → exactly one record/one toast.

### B2. Navigation and session
- [ ] Deep links: open a lead URL logged out → login → lands on the lead. Open a task "Öffnen" link for a
  lead that was reassigned away → clean "keine Berechtigung", not an error.
- [ ] Back/forward between list → detail → list keeps tab, search and "Nur überfällige"? (Note what is lost.)
- [ ] Session expires mid-form (DevTools → Application → delete `sb-…` key, then submit) → login prompt or
  German error; form input not silently lost without a hint.
- [ ] 2FA session on a second tab: confirm 2FA in tab A → tab B's admin buttons enable after reload.
- [ ] Offline (DevTools → Offline): create a task / log an activity → German network error, no spinner forever;
  back online → retry works. Check the PWA offline page.

### B3. Time, dates, calendar
- [ ] DST switch days: appointment on 29.03.2027 02:30 (doesn't exist in Berlin) and 31.10.2027 02:30 (exists
  twice) → stored and shown sensibly, no shift by an hour.
- [ ] Lead received Friday 16:30 with SLA 4 h → due Monday 12:30; on a Friday before a holiday Monday → Tuesday.
- [ ] SLA 1 h and 400 h; working day 00:00–23:59; only Saturday as working day.
- [ ] Holiday added for today while leads are open → deadlines move; removing it moves them back.
- [ ] Month windows at New Year: activities page on 31.12 vs 01.01 (`SET app.business_today` not needed —
  use the system clock or the DB setting described in CLAUDE.md §10).
- [ ] Task due today: shown under Offen until 17:00 Berlin, then Überfällig (check at 17:01).

### B4. Odd input
- [ ] Names with `ß`, umlauts, emoji, Arabic/Hebrew (RTL), 100-character names, a company only.
- [ ] Phone formats: `+43 664 …`, `+1 …`, `(0) 170`, `0170/123 45 67`, only spaces.
- [ ] E-mail with `+tag`, uppercase domain, trailing space.
- [ ] Notes with 4,000 characters exactly; 4,001 → blocked with counter; line breaks kept in display.
- [ ] Search with `%`, `_`, `,`, `(`, `*`, quotes → no error, no "matches everything".

### B5. Security
- [ ] Names/notes containing `<img src=x onerror=alert(1)>` and `"><script>` → shown as text in list, detail,
  notifications, task titles, audit log, CSV export (if any). No dialog fires.
- [ ] Notification link tampering: an attacker-controlled title can't create an external link (links are
  relative only).
- [ ] As Ben, call `rpc_set_task_status`, `rpc_log_activity`, `rpc_assign_lead` for Ali's records (API) → all
  `forbidden`. As finance/compliance, select `leads`, `activities`, `tasks` → empty.
- [ ] Deactivated employee with leads, pool leads and open tasks → generators move tasks to the manager; can
  they still see their old leads? (They must not.)

### B6. Lifecycle chains
- [ ] Merge chain: A into B, then B into C → C has all activities; A and B URLs "nicht gefunden".
- [ ] Merge, then convert the kept lead into a customer (**In Kunden umwandeln**) → customer keeps source.
- [ ] Lead → Verloren → reopen → Gewonnen: stepper, analytics (won, not lost), loss reason cleared?
- [ ] Reassign a lead whose Erstkontakt task was dismissed → new owner gets a task (dismissal is per owner).
- [ ] Pool lead created by Tim, Tim deactivated → who sees it now, who gets "Lead zuweisen"?

### B7. Automatic assignment
- [ ] Turn on with max 1 → Tim creates 3 pool leads → generators → least-loaded people get one each until
  everybody has 1, rest stays in the pool; one digest notification per recipient.
- [ ] Admin-created pool leads are never auto-assigned.

### B8. Accessibility and layout
- [ ] Keyboard only through: Lead anlegen, stage change, assignment, reschedule dialog, bell settings,
  admin matrix. Focus visible, Esc closes dialogs, focus returns to the trigger.
- [ ] Screen reader names: bell ("Benachrichtigungen (n ungelesen)"), ⋯ menus ("Aktionen für …"), skipped
  stages, time inputs with labels.
- [ ] 360 px (DevTools device mode, Chrome's window can't go below 500 px): leads, lead detail, tasks,
  activities, admin leads, analytics → no horizontal page scroll.
- [ ] Light and dark on every Phase 4 screen; dashed "skipped" chips readable in both.
- [ ] Lighthouse (mobile, incognito) for `/vertrieb/leads` and a lead detail: note Performance / A11y scores.

### B9. Volume and speed
```bash
pvsql <<'SQL'
INSERT INTO public.leads (first_name, last_name, phone, source_id, received_at, owner_id, created_by, stage, sla_due_at)
SELECT 'Perf', 'Lead ' || g, '+49176' || lpad(g::text, 7, '0'),
       (SELECT id FROM public.lead_sources ORDER BY random() LIMIT 1),
       now() - (random() * interval '700 days'),
       e.id, e.id, (ARRAY['assigned','contact_attempted','contacted','qualified','offer'])[1 + g % 5],
       now() - (random() * interval '700 days') + interval '1 day'
FROM generate_series(1, 5000) g
CROSS JOIN LATERAL (SELECT id FROM public.employees WHERE employee_no = (ARRAY['E2E-FA-A','E2E-FB-A','E2E-FB-B'])[1 + g % 3]) e;
INSERT INTO public.tasks (owner_id, title, due_at, status, completed_at)
SELECT (SELECT id FROM public.employees WHERE employee_no = 'E2E-FA-A'), 'Perf-Aufgabe ' || g,
       now() + ((g % 60) - 30) * interval '1 day', (ARRAY['open','done','cancelled'])[1 + g % 3],
       CASE WHEN g % 3 = 0 THEN NULL ELSE now() END
FROM generate_series(1, 2000) g;
SQL
pvsql -c "\timing" -c "select app_private.run_task_generators();"
```
- [ ] Generator run time (note it); notifications: one per person and kind.
- [ ] `/vertrieb/leads` as Tim: request size and time (Network), search reaches leads outside the newest 1,000,
  typing stays smooth.
- [ ] `/vertrieb/aufgaben` as Ali: ~667 open tasks render and page; time to interactive.
- [ ] Auswertung "Gesamt", 2 years: response time.
- [ ] `npx next build`: note First Load JS for the four Phase 4 pages.

Reset afterwards with `npm run e2e:prepare`.
