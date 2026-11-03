# Phase 4 — Manual test guide (click by click)

This guide walks through every Phase 4 function (tasks, notifications, activities, leads, lead analytics,
lead settings) on your local app. Each step names the URL, what to click (German label, **English meaning
in parentheses**) and what you should see. Unlike the Phase 1 guide it also has an explicit UI/UX
checklist (§11), a performance pass (§12) and a list of suspected issues found while reading the code
(§13): please confirm or reject those.

Tick the boxes as you go (`- [x]`). Steps marked ⚠️ change data that later steps rely on, so keep the order.
Write every deviation into [r1-p4-verification.md](r1-p4-verification.md) (ID, steps, expected, actual).

---

## 0. Before you start

**Terminal**
```bash
npm run e2e:prepare        # WIPES the local DB: dev seed (all feature flags on) + Phase 1 people. ~40 s.
npm run dev                # app on http://localhost:5173
npm run totp -- admin@test.com   # 2FA code for admin actions (valid ~30 s)
```
There is **no Phase 4 test data** in the fill: you create it as you go. Keep the order of the sections.

**SQL helper** (`psql` isn't installed; this runs it inside the DB container):
```bash
alias pvsql='docker exec -i supabase_db_payload-vault psql -U postgres'
pvsql -c "select 1"
```

**Running the task generators.** Locally pg_cron may or may not be scheduled (every 15 min). To run
them *now*:
```bash
pvsql -c "select app_private.run_task_generators();"
```
(The Phase 4 docs mention an admin button for this on the tasks page; it does **not** exist. See P4-UI-01.)

**Who is who in Phase 4** (password `123456` everywhere; same people as in Phase 1)

| Account | Person | Role in the Phase 4 story |
|---|---|---|
| tl@test.com | Tim Teamleiter | leader: sees Anna, Ali, Ben; pool, Team tabs, Auswertung |
| fb.a@test.com | Anna Alpha | Ali's **direct** manager: gets SLA escalations for Ali's leads |
| fa.a@test.com | Ali Alpha | ordinary adviser: own leads only, no assignment controls |
| fb.b@test.com | Ben Beta | peer of Anna in Tim's team: must **not** see Ali's leads/tasks/activities |
| tl2@test.com | Tina Teamleiterin | leader of a different structure: sees nothing of Tim's team |
| admin@test.com | Erika Mustermann | admin (2FA): `/admin/leads`, "Gesamt" analytics, assigns across structures |
| finance@test.com | Frank Finanz | finance: **no** lead or activity access; may set source costs (2FA) |
| compliance@test.com | Clara Compliance | compliance: **no** lead or activity access |
| vault@test.com | — | not an employee: "nur für aktive Mitarbeitende" empty states |

Tip: admin in the normal window, the second person in a private window, a third in another browser profile.

**Words you will see**
- **Lead** = sales prospect. **Pool / Nicht zugewiesen** = lead without an owner.
- **Phase** = pipeline stage: Neu → Zugewiesen → Kontaktversuch → Erreicht → Qualifiziert → Termin vereinbart → Termin durchgeführt → Angebot → **Gewonnen** (won) / **Verloren** (lost), plus **Später nachfassen** (nurture).
- **Erstkontakt / SLA** = first contact deadline, counted in **business hours** from receipt (provisional: 8 h, Mon–Fri 09–17, decision **OD-19**).
- **Aufgabe** = task; **Aktivität** = logged call/attempt/appointment…; **Termin** = appointment.

---

## 1. What is new in the UI (look at each once, light + dark)

| Where | New UI | Check |
|---|---|---|
| Sidebar → **Kunden & Leads** → **Leads**, sub-item **Auswertung** | new nav items; Auswertung only for leaders/admins | active highlight on sub-page, back link |
| Sidebar → **Vertrieb** → **Aufgaben** | new module | |
| Sidebar → **Verwaltung** → **Lead-Einstellungen** | new admin page | admin only |
| Page header, every sales page | **NotificationBell** (bell, red unread badge "99+", ring animation, "Wichtig" tag, "Alle gelesen", gear → mute settings) | panel not clipped on mobile, Esc/click outside closes |
| `/vertrieb/leads` | tabs with counters, search, phase filter (custom Select), DataTable with SLA **StatusBadge**, red overdue next step, mobile cards | |
| "Lead anlegen" modal | **LeadForm**: E.164 phone normalisation, inline errors, product-interest checkboxes, **EmployeePicker**, pool checkbox, **DuplicateWarning** (role=alert) with confirm checkbox, button text changes to "Trotzdem anlegen" | |
| `/vertrieb/leads/[id]` | **DetailLayout** + **RecordHeader** with **StageStepper** (won = green, lost = red outcome), "In Kunden umwandeln" (Phase 5), work column (Aktivitäten, Verlauf), sticky aside (Phase ändern, Nächster Schritt, Zuständig, Details, Duplikate) | aside sticky on desktop, stacks on mobile |
| `/vertrieb/leads/analyse` | **PeriodSelector**, scope Tabs, 4 rate **KpiTiles** with "x von y · Definition", **FunnelChart**, Erstkontakt tiles, tables (Quellen / Nach Person), loss reasons, by month, admin-only "Quellen im Zeitverlauf" | chart colours/tokens in dark mode |
| `/vertrieb/aufgaben` | red "Überfällig" box, "Offen" card, collapsed "Erledigt / geschlossen" `<details>`, each with **Pagination**; checkbox complete/reopen; priority badge; "Öffnen" link | |
| `/vertrieb/aufgaben/aktivitaeten` | 4 month KPI tiles + definition caption, **ActivityPanel** (quick-entry form, appointment states "vereinbart" / "Ergebnis fehlt", outcome chips) | |
| `/vertrieb` (Cockpit) "Mein Monat" | new row: Termine vereinbart / durchgeführt / Angebote / Nachfassen with delta vs goal, "Aktivitäten erfassen" link | |
| `/admin/leads` | SLA card with **ProvisionalRuleNotice** OD-19, Automatische Zuweisung (approve/decline buttons), stage × required-field matrix in **ScrollX**, sources + monthly costs (**CurrencyInput**, paged list), holidays; every change through **ReasonConfirmForm** (char counter) | MfaRequiredNotice without 2FA |

---

## 2. Access: who sees what (do this first, read-only)

- [ ] **2.1 Ali (fa.a@).** Sidebar has **Leads** and **Aufgaben**, but **no** "Auswertung" sub-item and no Verwaltung. `/vertrieb/leads` shows only tabs **Meine (0)** and **Abgeschlossen**. No "Auswertung" button top right.
- [ ] **2.2 Ali opens http://localhost:5173/vertrieb/leads/analyse directly.** The page works, scope tabs show only **Meine Leads**. (Decide: is that OK or should it be hidden? Note it.)
- [ ] **2.3 Tim (tl@).** Tabs **Meine / Team / Nicht zugewiesen / Abgeschlossen**, button **Auswertung** + **Lead anlegen**. Aufgaben shows tabs **Meine Aufgaben / Team**.
- [ ] **2.4 Admin.** Additionally `/admin/leads` and "Gesamt" in Auswertung.
- [ ] **2.5 Finance (finance@) and compliance (compliance@).** `/vertrieb/leads` → no leads (empty list, no error toast). After section 5 come back: still no leads visible. `/vertrieb/aufgaben/aktivitaeten` shows only their own (none).
- [ ] **2.6 vault@.** `/vertrieb/leads`, `/vertrieb/aufgaben` → "nicht freigeschaltet" or "… nur für aktive Mitarbeitende". No crash, no red error.
- [ ] **2.7 Unknown/invalid lead URL.** http://localhost:5173/vertrieb/leads/abc → "Lead nicht gefunden." · http://localhost:5173/vertrieb/leads/00000000-0000-0000-0000-000000000000 → "Lead nicht gefunden oder keine Berechtigung."

---

## 3. Tasks (Aufgaben)

- [ ] **3.1 Empty state.** Ali → http://localhost:5173/vertrieb/aufgaben → "Offen (0)", "Keine offenen Aufgaben." No Team tab.
- [ ] **3.2 Validation.** **Aufgabe anlegen** (create task) → **Titel** `ab` → **Speichern** stays disabled (min 3 chars). No Zuständig picker for Ali.
- [ ] ⚠️ **3.3 Own task.** Titel `Unterlagen anfordern`, **Fällig am** (due) = tomorrow, **Priorität** hoch → **Speichern** → toast "Aufgabe angelegt", row under Offen with type "Aufgabe", "fällig <date>", orange "hoch" badge.
- [ ] ⚠️ **3.4 Overdue task.** Another task due **yesterday** → appears in the red **Überfällig (1)** box at the top. (The date picker allows past dates; is that wanted?)
- [ ] **3.5 Due today edge.** A task due **today** stays under **Offen** until 17:00 Berlin (due time is fixed at 17:00), then moves to Überfällig after a reload/60 s refresh.
- [ ] **3.6 Complete / reopen.** Tick the checkbox of 3.3 → strikes through, moves into collapsed **Erledigt / geschlossen (1)**. Open it, untick → back to Offen. No page jump, no flicker.
- [ ] ⚠️ **3.7 Leader assigns.** Tim → Aufgabe anlegen → **Zuständig** (owner) = Ali, Titel `Termin mit Kunde vorbereiten` → Speichern. Tim → tab **Team** shows it. Ali gets a bell badge (wait ≤ 60 s or reload) with "…" linking to the tasks page.
- [ ] **3.8 Peer isolation.** Ben → Aufgaben: none of Ali's tasks. Tina: none. Anna (Ali's manager) → Team tab shows Ali's tasks.
- [ ] **3.9 Manager can complete a report's task.** Tim → Team → tick Ali's task → done; Ali sees it as done.
- [ ] **3.10 Pagination.** With > 10 tasks in one section (§12 creates many), the section shows page controls; page size choice persists (shared localStorage `page-size`).
- [ ] **3.11 Error state.** DevTools → Network → block `*/rest/v1/tasks*` → reload. Expected: an error message. Suspected actual: "Keine offenen Aufgaben." (P4-UI-04).

## 4. Notifications (bell)

- [ ] **4.1 Badge and panel.** Ali: unread count badge; click bell → panel "Benachrichtigungen", unread dot, time stamp. Esc closes; clicking outside closes.
- [ ] **4.2 Click marks read.** Click a notification with a link → navigates, panel closes, badge decreases.
- [ ] **4.3 Alle gelesen.** → badge disappears, button disabled.
- [ ] ⚠️ **4.4 Mute.** Gear → tick **Zugewiesene Aufgaben** → **Speichern**. Tim assigns another task to Ali → task exists, **no** new notification. Text explains "Freigaben und Prüffälle bleiben immer sichtbar"; critical kinds aren't in the list.
- [ ] **4.5 Mute state shown again?** Re-open the gear: are your saved mutes pre-ticked? (The component starts with an empty list; suspected P4-UX-07: saving again would silently un-mute.)
- [ ] **4.6 Mobile.** At 360 px the panel fits the screen (no horizontal scroll).

## 5. Leads: creating and duplicates

Log in as **Ali** → http://localhost:5173/vertrieb/leads → **Lead anlegen** (create lead).

- [ ] **5.1 Validation.** Empty form → button disabled (needs Nachname or Firma). Telefon `abc` → "Ungültige Telefonnummer"; E-Mail `x@` → "Ungültige E-Mail-Adresse".
- [ ] **5.2 No contact data.** Only Nachname → hint "Ohne Telefon und E-Mail kann der Lead nicht kontaktiert werden…". Don't save.
- [ ] **5.3 Received date.** **Eingegangen am** can't be set in the future (picker max = today).
- [ ] ⚠️ **5.4 Create lead A.** Vorname `Lena`, Nachname `Lead`, Telefon `0170 1234567`, E-Mail `Lena.Lead@Example.de`, Quelle Website, no product interest → **Lead anlegen** → you land on the lead page. Details show `+491701234567` and `lena.lead@example.de` (normalised). SLA badge **offen** with "fällig bis …" (8 business hours from now; on a Friday afternoon → Monday).
- [ ] **5.5 Duplicate by phone.** New lead `Lena Lead2`, Telefon `+49 170 1234567` → **Lead anlegen** → yellow box **Mögliche Duplikate gefunden** with "L-… Lena Lead · gleiche Telefonnummer · zuständig: Ali Alpha". Button now **Trotzdem anlegen**, disabled until **Geprüft: Das ist eine andere Person, trotzdem anlegen.** is ticked. Link opens in a new tab. **Cancel the modal** (don't save).
- [ ] **5.6 Duplicate by e-mail (other casing)** `LENA.LEAD@example.de` → "gleiche E-Mail". By name `Lena Leed` → "ähnlicher Name".
- [ ] **5.7 Changing any field resets the warning** (box disappears, button back to "Lead anlegen").
- [ ] ⚠️ **5.8 Hidden duplicates.** Tina creates a lead with phone `0170 1234567` → warning shows **"Lead einer anderen Person"** + owner name, no link, no details. Cancel.
- [ ] ⚠️ **5.9 Lead B for later.** Ali creates `Bernd Berger`, Telefon `0171 7654321`, Quelle Empfehlung.
- [ ] ⚠️ **5.10 Back-dated lead C (SLA test).** Ali creates `Clara Spät`, Telefon `0172 1111111`, **Eingegangen am** = 10 days ago → SLA badge **überfällig** (red) in list and details.
- [ ] **5.11 List.** Ali → Leads → **Meine (3)**. Columns Lead (name + L-number), Phase, Zuständig, Quelle, Eingang, Erstkontakt badge, Nächster Schritt. Hover on badge → "fällig bis …". Sorting works on each sortable column.
- [ ] **5.12 Search.** `lena` → found; `L-1`/the L-number → found; `+49170` → found; **`0170 1234567` → expected found, suspected not found** (P4-UI-02). Phase filter "Kontaktversuch" → empty list text "Keine Leads in dieser Ansicht".
- [ ] **5.13 Counter vs filter.** With a search active, the tab counters still show totals (P4-UX-02: OK or confusing?).

## 6. Lead detail: activities and pipeline

Ali → open **Lena Lead**.

- [ ] **6.1 Layout.** Header: name, "L-… ", StageStepper with **Neu** active, button **In Kunden umwandeln**. Aside: Phase ändern, Nächster Schritt ("Kein nächster Schritt geplant."), Zuständig: Ali Alpha (no picker for Ali), Details with OD-19 notice "Die Erstkontakt-Frist (8 Geschäftsstunden) ist ein Platzhalter…", Duplikate.
- [ ] **6.2 Details values.** Priorität and Produktinteresse: expected German labels; **suspected raw codes** ("normal"/"high", category codes) (P4-UI-03). Rechtsgrundlage "nicht erfasst" in gold.
- [ ] ⚠️ **6.3 Auto stage: contact attempt.** In **Aktivitäten**: Art **Kontaktversuch**, Datum today, no time, Ergebnis **nicht erreicht** → **Erfassen**. → Stepper moves to **Kontaktversuch**; Verlauf "… Kontaktversuch (automatisch)"; Details Erstkontakt **rechtzeitig** + time.
- [ ] ⚠️ **6.4 Auto stage: reached.** Anruf (call), Ergebnis **erreicht** → **Erreicht**.
- [ ] **6.5 Required fields shown before submit.** Phase ändern → **Neue Phase** = Qualifiziert → red "Es fehlt: Produktinteresse." and **Phase setzen** disabled.
- [ ] ⚠️ **6.6 Fix via edit.** Details → **Bearbeiten** (edit) → tick a product interest → **Speichern** → modal closes. Phase ändern → Qualifiziert → Phase setzen → stepper Qualifiziert, Verlauf entry with your name.
- [ ] **6.7 Backwards needs reason.** Neue Phase = Kontaktversuch → label "Begründung (Pflicht, mind. 10 Zeichen)", button disabled until 10 chars. Don't save (or save and move forward again).
- [ ] ⚠️ **6.8 Appointment booked (future).** Art **Termin**, Termin am = tomorrow, Uhrzeit `10:00` → Erfassen. → stage **Termin vereinbart**; row shows blue **vereinbart** and only chips **abgesagt / verschoben**.
- [ ] **6.9 Appointment missing time.** Art Termin without Uhrzeit → Erfassen disabled. Uhrzeit `25:99` → button enabled? → what happens? (P4-UX-01). Art Kontaktversuch with Uhrzeit `abc` → what happens?
- [ ] ⚠️ **6.10 Appointment in the past.** Termin today, 1 hour ago → orange **Ergebnis fehlt** with chips durchgeführt / nicht erschienen / abgesagt / verschoben. Click **nicht erschienen** → red badge. (Can it be changed to "durchgeführt" afterwards? Docs say yes; the UI only shows chips while no outcome is set. Note what you find.)
- [ ] ⚠️ **6.11 Held.** Book another past appointment → **durchgeführt** → stage **Termin durchgeführt**. Further activities never move it past that (log a call "erreicht": stays).
- [ ] **6.12 Next step.** Nächster Schritt: Was `Angebot nachfassen`, Wann = yesterday, Uhrzeit `10:00` → **Planen** → text red "(überfällig)", list column red. Then plan for next week → normal colour.
- [ ] ⚠️ **6.13 Skip forward manually.** Lead B (Bernd, stage Neu) → Neue Phase **Angebot** → needs Produktinteresse (edit first) → Phase setzen works (allowed skip). Stepper jumps; Verlauf shows the manual move.
- [ ] ⚠️ **6.14 Lost.** Lead B → Neue Phase **Verloren** → Select **Verlustgrund** appears; without it "Es fehlt: Verlustgrund." → choose "Preis" → Phase setzen. Header shows red outcome on the stepper (stays at the last open stage), activity form disappears, list moves it to **Abgeschlossen**, aside "Verlustgrund: Preis".
- [ ] **6.15 Reopen.** Lead B → Neue Phase Angebot → reason required (≥ 10 chars) → works, back in Meine.
- [ ] **6.16 Won.** Move a lead to **Gewonnen** → green outcome; allowed without linked contract by default.
- [ ] **6.17 No toast on success** after Phase setzen / Planen / Bearbeiten: is the silent success OK? (P4-UX-06)

## 7. Assignment and pool

- [ ] ⚠️ **7.1 Pool lead.** Tim → Lead anlegen → `Paul Pool`, Telefon `0173 2222222`, tick **Noch nicht zuweisen (Pool)** (the Zuständig picker disappears) → save. Tim → tab **Nicht zugewiesen (1)**; "Zuständig: Pool" on the detail; **In Kunden umwandeln** is hidden.
- [ ] **7.2 Ali can't see pool leads.** Ali → open the URL of Paul Pool → "Lead nicht gefunden oder keine Berechtigung."
- [ ] ⚠️ **7.3 First assignment, no reason.** Tim → Paul Pool → **Zuweisen an** = Ali → no reason field → **Zuweisen** → toast "Zugewiesen". History: "… Pool → Ali Alpha (durch Tim Teamleiter)". Ali gets "Lead zugewiesen: Paul Pool" in the bell and sees the lead.
- [ ] ⚠️ **7.4 Reassignment needs a reason and moves appointments.** Ali books a **future** appointment on Paul Pool. Tim → **Neu zuweisen an** = Ben (Ali excluded from picker) → reason field required (≥ 10 chars) → Zuweisen → toast "1 anstehende(r) Termin(e) übertragen."
- [ ] **7.5 Previous owner loses access.** Ali → Paul Pool URL → "nicht gefunden oder keine Berechtigung". Ali's own activity on it still counts on Ali's Aktivitäten page.
- [ ] **7.6 Advisers can't hand over.** Ben (now owner, FB without reports) → no Zuweisen controls (unless Ben is a leader; he isn't).
- [ ] **7.7 Admin across structures.** Admin (2FA confirmed) → assign Paul Pool to Fritz (Tina's team) with reason → works. Without a confirmed 2FA session → German MFA error toast.

## 8. SLA and generated tasks

- [ ] ⚠️ **8.1 Run generators.** `pvsql -c "select app_private.run_task_generators();"`
- [ ] **8.2 Overdue first contact.** Ali → Aufgaben → **Überfällig** contains "Erstkontakt: Clara Spät", type **Erstkontakt**, badge **hoch**, link **Öffnen** → lead page.
- [ ] **8.3 Escalation.** Anna (Ali's direct manager) → bell "Erstkontakt überfällig: Clara Spät" → link opens the lead. Run generators again → **no second** notification, **no duplicate** task.
- [ ] ⚠️ **8.4 Task closes itself.** Ali logs a call on Clara Spät → run generators → Erstkontakt task under Erledigt with note "Kontakt erfolgt oder Lead abgegeben"; new task "Nächsten Schritt festlegen: Clara Spät". Details: badge **verspätet** (late).
- [ ] **8.5 Next-step task closes** after planning a future next step + generators. A lead with a booked future appointment gets no next-step task.
- [ ] **8.6 Pool task.** Tim creates another pool lead → generators → Tim has "Lead zuweisen: …" task; assign it → generators → task closed "Lead wurde zugewiesen". A pool lead created by admin → task for every active admin.
- [ ] **8.7 Badge legend.** You've now seen rechtzeitig (green), verspätet (orange), offen (blue), überfällig (red), "–" (closed without contact).

## 9. Merge duplicates

- [ ] ⚠️ **9.1 Prepare.** Ali creates `Lena Lead` again with phone `0170 1234567` (confirm the duplicate box), add a note and an activity on it.
- [ ] **9.2 Check.** Open the **first** Lena Lead → Duplikate → **Prüfen** → "L-… Lena Lead · gleiche Telefonnummer · Ali Alpha" + **In diesen Lead übernehmen**.
- [ ] ⚠️ **9.3 Merge.** Click it → dialog "Leads zusammenführen" with explanation; reason < 10 chars → error; valid reason → **Zusammenführen**. Result: empty fields of the kept lead filled, activities moved, the duplicate gone from the list, its URL "nicht gefunden".
- [ ] **9.4 No merge without access.** Tina's lead with the same phone appears as "Lead einer anderen Person" without a merge button.
- [ ] **9.5 Prüfen again** → "Keine Duplikate gefunden."

## 10. Admin: lead settings (`/admin/leads`)

- [ ] **10.1 Without 2FA confirmed.** Fresh admin login, don't confirm 2FA → MfaRequiredNotice; Hinzufügen/Deaktivieren/Entfernen disabled; SLA save → German MFA error inside the reason dialog.
- [ ] **10.2 Confirm 2FA** (`/profil/sicherheit`, `npm run totp -- admin@test.com`).
- [ ] **10.3 SLA validation.** Stunden `0`, `401`, `abc` → Speichern disabled. Arbeitsbeginn `17:00`, Arbeitsende `09:00` → disabled. Untick all Arbeitstage → disabled. Uhrzeit `9:00` (one digit) → disabled (format HH:MM).
- [ ] ⚠️ **10.4 Save SLA 4 h.** Stunden `4` → Speichern → dialog "Erstkontakt-Frist ändern" + reason → saved. OD-19 notice disappears here **and** on lead pages; open uncontacted leads show a new "fällig bis" (4 business hours from receipt).
- [ ] **10.5 Holiday moves deadlines.** Add a holiday on the next working day (Region `DE`, Bezeichnung `Testfeiertag`) → a fresh lead created today late afternoon gets its deadline after that day. Region `XY` → Hinzufügen disabled. Remove the test holiday again (**Entfernen**).
- [ ] **10.6 Stage matrix.** Horizontal scroll with ScrollX bar on narrow screens. Change a tick → row shows **Speichern** → reason → saved. Try deactivating **Neu**, **Gewonnen**, **Verloren** or a stage that holds leads → German error ("In dieser Phase befinden sich noch Leads." etc.).
- [ ] ⚠️ **10.7 Skip rule.** Untick **Überspringbar** for "Angebot" → save. On a lead in "Erreicht", set phase Angebot → "Diese Phase darf nicht übersprungen werden." Re-tick afterwards.
- [ ] **10.8 Required field "verknüpfter Vertrag" on Gewonnen** → moving to Gewonnen now names it as missing. Remove again.
- [ ] ⚠️ **10.9 Sources.** Add `Messe 2027` (Art Kampagne) → appears in the Lead anlegen Quelle select. **Deaktivieren** → struck through, gone from the select, existing leads keep it.
- [ ] ⚠️ **10.10 Costs.** Quelle Website, Monat = this month (any day is snapped to the 1st), Betrag `100,00` → Speichern → list "MM.YYYY · Website · 100,00 €". Empty Betrag + Speichern → entry removed. Set it again (needed in §11). Finance (with 2FA) can also save costs; Tim can't see this page.
- [ ] ⚠️ **10.11 Automatic assignment.** Max `1` → **Einschalten** → reason → status "Eingeschaltet". Tim creates 2 pool leads → run generators → the first goes to the least-loaded person in Tim's structure; persons at the limit get none; leftovers stay in the pool. Admin-created pool leads are never auto-assigned. **Ausschalten** afterwards.

## 11. Lead analytics (`/vertrieb/leads/analyse`)

- [ ] **11.1 Tim.** Scope **Mein Team** preselected, period = current month. Four tiles: Kontaktquote, Terminquote, Erscheinensquote, Abschlussquote, each "x von y · definition".
- [ ] **11.2 Funnel never increases.** Bernd (skipped straight to Angebot in 6.13) counts as erreicht/Termin vereinbart; each FunnelChart bar ≤ the one before. Caption explains cohort by receipt date + current owner.
- [ ] **11.3 Erstkontakt.** Ø and median hours (calendar hours), "Innerhalb der Frist x von y", red line "n Lead(s) noch ohne Erstkontakt und über der Frist" if any. "Offene Leads nach Phase" with Ø age.
- [ ] **11.4 Sources.** No cost/commission columns in Mein Team; footnote says why. Admin → **Gesamt** → Provision (brutto), Kosten/Lead, Kosten/Abschluss appear (Website: 100 € / leads), "–" where no cost.
- [ ] **11.5 Nach Person** (team and all only), **Verlustgründe** with share "x % von n", **Nach Eingangsmonat** only with > 1 month (choose a year).
- [ ] **11.6 Empty period.** Previous year, January → "Im gewählten Zeitraum sind keine Leads eingegangen." No "NaN %" anywhere.
- [ ] **11.7 Range.** Invalid custom range (end before start) → "Bitte einen gültigen Zeitraum wählen." Years offered: only last + current year.
- [ ] **11.8 Admin-only "Quellen im Zeitverlauf"** table below. Is admin@ (who is a leader) preselected on Mein Team? Is an admin who is *not* a leader preselected on "Meine Leads" (P4-UX-04)?
- [ ] **11.9 Reassigned lead** (Paul Pool → Ben → Fritz) counts for the **current** owner only.

## 12. Activities page and cockpit

- [ ] **12.1** Ali → **Aufgaben** → **Aktivitäten & Termine** → tiles: Kontaktversuche with "Erreichbarkeit x % (erreicht ÷ Versuche)", Termine vereinbart ("n anstehend"), durchgeführt ("n nicht erschienen"), Angebote / Nachfassen. Log a "nicht erreicht" and a "erreicht" attempt in a fresh month → 50 %.
- [ ] **12.2 Definitions.** An appointment created today for next month counts as **vereinbart** this month and **durchgeführt** next month.
- [ ] **12.3 Log rows** don't say which lead they belong to (P4-UX-03: wanted?).
- [ ] **12.4 Cockpit** http://localhost:5173/vertrieb → "Mein Monat" activity row. Delta vs goal only when the monthly goal has that target (set targets in `/vertrieb/ziele` and compare).
- [ ] **12.5 Team visibility.** Tim sees Ali's lead activities on the lead page; Ben doesn't (lead not visible at all).
- [ ] **12.6 Future date.** Non-appointment with a date in the future isn't selectable (picker max = today).

---

## 13. UI/UX checklist (each new screen from §1)

Do every screen in **light and dark** (avatar → theme), at **1440 px, 768 px, 360 px** (DevTools device toolbar).

- [ ] No horizontal page scroll at 360 px; wide tables scroll inside **ScrollX** with Shift+wheel.
- [ ] DataTables turn into cards on mobile; hidden columns (`hideOnMobile`) don't lose essential info (SLA badge stays).
- [ ] Lead detail: aside stacks under the main column on mobile in a sensible order (is "Phase ändern" too far down?).
- [ ] Tabs wrap or scroll on 360 px (Leads has 4 tabs with counters).
- [ ] Modals (Lead anlegen is `large`) become a bottom sheet on mobile; the long form is scrollable; the submit button is reachable.
- [ ] Keyboard only: Tab through Lead anlegen; Selects open with Enter/Space, arrows + type-ahead; checkboxes reachable; modal traps focus, Esc closes; tabs switch with arrow keys; bell reachable and closable with Esc.
- [ ] Focus visible everywhere; buttons have accessible names (bell: "Benachrichtigungen (n ungelesen)").
- [ ] Loading: skeletons, not "Lädt…". Errors (block requests in DevTools): German messages that name what failed; never raw English/DB text.
- [ ] Copy: formal "Sie", consistent words (Phase vs Stufe, Auswertung vs Analyse, Zuständig), no raw codes (see P4-UI-03), dates German `dd.mm.yyyy`, numbers with comma.
- [ ] Colours: status tones only from tokens; FunnelChart readable in dark mode; red only for overdue/lost.
- [ ] One dominant primary button per page (Leads: "Lead anlegen"; Aufgaben: "Aufgabe anlegen").
- [ ] Hand-rolled text buttons ("Bearbeiten", "Prüfen", "In diesen Lead übernehmen", outcome chips, "Entfernen") look and behave consistently with the kit (`ui-link-button`, hover, focus, disabled) (P4-UX-06).

---

## 14. Performance pass

### 14.1 Volume data (after finishing §2–§12; adds data, doesn't delete)
```bash
pvsql <<'SQL'
-- 1,500 leads for Ali / Anna / Ben, received over the last 2 years
INSERT INTO public.leads (first_name, last_name, phone, source_id, received_at, owner_id, stage, sla_due_at)
SELECT 'Perf', 'Lead ' || g,
       '+49170' || lpad(g::text, 7, '0'),
       (SELECT id FROM public.lead_sources ORDER BY random() LIMIT 1),
       now() - (random() * interval '700 days'),
       (SELECT id FROM public.employees WHERE employee_no = (ARRAY['E2E-FA-A','E2E-FB-A','E2E-FB-B'])[1 + g % 3]),
       (ARRAY['assigned','contact_attempted','contacted','qualified','offer'])[1 + g % 5],
       now() - (random() * interval '700 days') + interval '1 day'
FROM generate_series(1, 1500) g;

-- 600 tasks for Ali: 1/3 open, the rest done/cancelled
INSERT INTO public.tasks (owner_id, title, due_at, status, completed_at)
SELECT (SELECT id FROM public.employees WHERE employee_no = 'E2E-FA-A'),
       'Perf-Aufgabe ' || g, now() + ((g % 60) - 30) * interval '1 day',
       (ARRAY['open','done','cancelled'])[1 + g % 3],
       CASE WHEN g % 3 = 0 THEN NULL ELSE now() END
FROM generate_series(1, 600) g;

-- 400 activities for Ali this month and last
INSERT INTO public.activities (owner_id, type, occurred_at, outcome)
SELECT (SELECT id FROM public.employees WHERE employee_no = 'E2E-FA-A'),
       'contact_attempt', now() - (random() * interval '45 days'),
       (ARRAY['reached','not_reached'])[1 + g % 2]
FROM generate_series(1, 400) g;
SQL
```

### 14.2 What to measure (Chrome DevTools, logged in as Ali and as Tim)
- [ ] **Leads list:** Network → `leads?select=*…` size and time. Expect truncation at **1000 rows**: does "Meine (n)" show the true number? (P4-PERF-02). Typing in the search: input lag? (React DevTools Profiler → whole table re-renders per keystroke.)
- [ ] **Polling:** leave `/vertrieb/leads` open 3 min → requests every 60 s for leads, tasks/notifications. Switch tabs and back → refetch on focus. Acceptable?
- [ ] **Tasks:** Ali → Aufgaben. With 600 tasks: are all ~200 **open** tasks there? Query is `order(status).limit(500)`, and alphabetically `cancelled < done < open`, so open tasks may be cut off (P4-PERF-01, likely real bug).
- [ ] **Activities page:** limit 300; month tiles come from the RPC (correct) but the log shows max 300 rows without telling.
- [ ] **Lead detail:** number of requests on open (lead, history, assignments, activities, config, rules, structure); time to interactive.
- [ ] **Analytics:** Tim and admin "Gesamt", period = last year → time of `rpc_lead_funnel`. Then:
  ```bash
  pvsql -c "SET app.business_today = ''; EXPLAIN ANALYZE SELECT app_rpc.rpc_lead_funnel('2025-11-01','2026-11-01','all');"
  ```
  (Run as postgres: permission checks may refuse; then measure in the browser Network tab instead.)
- [ ] **Generators:** `pvsql -c "\timing" -c "select app_private.run_task_generators();"` → note time with the volume data (cron runs it every 15 min).
- [ ] **Lighthouse** (mobile, incognito) on `/vertrieb/leads` and a lead detail: Performance, Accessibility, Best Practices. Note scores.
- [ ] **Bundle:** `npx next build` → note First Load JS for `/vertrieb/leads`, `/vertrieb/leads/[id]`, `/vertrieb/leads/analyse`, `/admin/leads` (recharts only on analytics?).

To get rid of the volume data: `npm run e2e:prepare` (wipes everything).

---

## 15. Suspected issues found in the code (confirm or reject)

| ID | Where | Suspicion | How to check |
|---|---|---|---|
| P4-UI-01 | tasks page | No admin button to run the generators, though the Phase 4 docs say "admins run the generators from the tasks page" | admin → `/vertrieb/aufgaben` |
| P4-UI-02 | `src/views/leads/LeadsPage.tsx:64` | Phone search compares the raw input (spaces removed) with the stored E.164 number, so `0170…` never matches `+49170…` | 5.12 |
| P4-UI-03 | `src/views/leads/LeadDetailPage.tsx:209,212` | Details show raw `priority` ("high") and product interest codes | 6.2 |
| P4-UI-04 | `src/views/tasks/TasksPage.tsx:73` | Query error ignored, so the user sees "Keine offenen Aufgaben." | 3.11 |
| P4-PERF-01 | `src/hooks/useTasks/useTasks.ts:23` | `order("status").limit(500)` puts open tasks **last**, so they are cut off first | 14.2 |
| P4-PERF-02 | `useLeads.ts:55` (1000), `useActivities.ts:37` (300), `useTasks.ts` (500) | Silent truncation; counters wrong (§7 rule "never slice silently") | 14.2 |
| P4-UX-01 | ActivityPanel, NextStepCard, SLA card | Times are free text; `25:99` passes the appointment regex; non-appointment time isn't validated | 6.9 |
| P4-UX-02 | Leads tabs | Counters ignore search/phase filter | 5.13 |
| P4-UX-03 | Activities page | Rows don't show/link the lead | 12.3 |
| P4-UX-04 | `LeadAnalyticsPage.tsx:36` | Default scope computed once from `isLeader`; admins who aren't leaders start on "Meine Leads" | 11.8 |
| P4-UX-05 | Appointments | "verschoben" doesn't offer to book the new slot (known open item) | 6.10 |
| P4-UX-06 | several | Hand-rolled text buttons; no success toast for phase change / next step / edit / merge | 6.17, §13 |
| P4-UX-07 | `NotificationBell.tsx:33` | Mute settings open with nothing ticked even if kinds are muted; saving again un-mutes | 4.5 |
| P4-UX-08 | `ActivityPanel.tsx:91` | Outcome chips only while no outcome is set, so "no_show → held" correction (documented) isn't possible in the UI | 6.10 |
| P4-UX-09 | Tasks | Past due dates allowed when creating a task | 3.4 |
