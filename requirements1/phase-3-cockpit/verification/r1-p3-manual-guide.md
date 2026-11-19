# Phase 3 — Manual test guide (click by click)

This guide walks through the management cockpit on your local app: monthly goals, dashboards, forecasts,
the career simulator, performance profiles and coaching. Each step names the URL, what to click (German
label, **English meaning in parentheses**) and what you should see. Tick the boxes as you go (`- [x]`).
Steps marked ⚠️ change data that later steps rely on, so keep the order. Write every deviation into
[r1-p3-verification.md](r1-p3-verification.md) (ID, steps, expected, actual).

---

## 0. Before you start

**Terminal**
```bash
npm run e2e:prepare        # WIPES the local DB: dev seed + Phase 1 people and production (confirmed today). ~40 s.
npm run dev                # app on http://localhost:5173
npm run totp -- admin@test.com     # 2FA code for admin actions (valid ~30 s)
```
There is **no Phase 3 data** in the fill: you create goals and coaching entries as you go. (After a full
`npm run e2e` the specs have already created Fritz' goal, a coaching session and a private note — then
start at section 2 and read instead of create.)

**SQL helper**
```bash
alias pvsql='docker exec -i supabase_db_payload-vault psql -U postgres'
pvsql -c "select app_private.run_task_generators();"      # creates the goal-review / coaching / period-end tasks now
```

**Who is who** (password `123456` everywhere)

| Account | Person | Role in the Phase 3 story |
|---|---|---|
| fa@test.com | Fritz Fleißig | FA under Tina: plans his month, gets coached; 100 P but only 7 KV-P (§14.4) |
| tl2@test.com | Tina Teamleiterin | Fritz' direct manager: reviews goals, coaches, sees her structure |
| dl@test.com | Dora Direktor | DL above Tina: may also decide goals; sees Tina's **private** notes |
| fb.b@test.com | Ben Beta | peer in Tim's team: sees nothing of Fritz |
| nolevel@test.com | Nora Ohnestufe | in Tina's team without a level: "nicht berechenbar" |
| finance@test.com | Frank Finanz | finance: sees goals, decides none; no coaching; cockpit without personal section is **not** the case — Frank has an employee record |
| compliance@test.com | Clara Compliance | compliance: same as finance for goals/coaching |
| admin@test.com | Erika Mustermann | admin (2FA) and TL of Max: data-quality list; profiles without coaching |
| vault@test.com | — | not an employee: "nur für aktive Mitarbeitende" |

---

## 1. Monthly goals (`/vertrieb/ziele`) — spec §7.2, §14.5

Sign in as **fa@test.com** → Vertrieb → **Ziele** (goals).
- [ ] 1.1 Three tabs: this month and the next two. The form has Punkte, davon KV-Punkte, Termine vereinbart/durchgeführt, Angebote, Abschlüsse, Nachfassaktionen, Erwartete Produktion (€), Entwicklungsziel; the hint "Monatsziele sind Planwerte und keine Karriereschwellen."
- [ ] 1.2 Type `abc` into Punkte → **Entwurf speichern** (save draft) → "„Punkte“ ist keine Zahl." Nothing saved.
- [ ] 1.3 Punkte `20`, davon KV `25` → save → "Das KV-Ziel darf nicht größer als das Punkteziel sein."
- [ ] 1.4 Termine vereinbart `2,5` → save → "Bitte nur positive Zahlen eintragen (Anzahlen ohne Nachkommastellen)."
- [ ] ⚠️ 1.5 Punkte `20`, davon KV `2`, Termine durchgeführt `8`, Entwicklungsziel "Einwandbehandlung üben", Kommentar "Fokus auf KV" → **Einreichen** (submit) → toast **Eingereicht**, badge **Zur Freigabe**, fields read-only, "Wartet auf Freigabe durch die Führungskraft." If today is after the 1st: "nach Monatsbeginn eingereicht".
- [ ] 1.6 Next month's tab: still editable; **Einreichen** with nothing filled → "Bitte mindestens einen Zielwert eintragen."

Sign in as **tl2@test.com** → Ziele.
- [ ] 1.7 Below her own form: **Zur Freigabe (1)** with "Fritz Fleißig · <Monat>" and "Punkte: 20 · davon KV-Punkte: 2 · Termine durchgeführt: 8" and "Entwicklung: Einwandbehandlung üben".
- [ ] ⚠️ 1.8 **Zurückgeben** (return) → dialog "Ziel zurückgeben", Rückmeldung (feedback) "x" → refused (≥ 3 characters); "KV-Ziel bitte auf 3 erhöhen" → toast **Zurückgegeben**; the list is empty.

Sign in as **fa@test.com** → Ziele.
- [ ] ⚠️ 1.9 Badge **Zurückgegeben**, note "Rückmeldung: KV-Ziel bitte auf 3 erhöhen", the submitted values are prefilled. Change KV to `3` → **Einreichen** → **Zur Freigabe** again.

Sign in as **dl@test.com** (Tina's manager) → Ziele.
- [ ] ⚠️ 1.10 Dora sees Fritz' goal under **Zur Freigabe (1)** (an indirect manager may decide) → **Freigeben** (approve) → toast **Freigegeben**.
- [ ] 1.11 `pvsql -c "select version, targets->>'kv_points', employee_comment from public.monthly_goal_versions order by version"` → version 1 (KV 2,00, "Fokus auf KV") and version 2 (KV 3,00) — both kept. `select decision, comment from public.goal_reviews order by created_at` → returned + approved.

Sign in as **fa@test.com** → Ziele.
- [ ] 1.12 Badge **Freigegeben** and the note "Dieses Ziel ist freigegeben. Änderungen setzen es auf „Entwurf“ zurück …" (P3-UI-01). Change Punkte to 21 → **Entwurf speichern** → badge **Entwurf** (needs a new submission).

Sign in as **finance@test.com** and then **compliance@test.com** → Ziele.
- [ ] 1.13 Their own (empty) form, **no** "Zur Freigabe" section, no Freigeben buttons (P3-GOAL-01) — although `v_goals` lists every goal for them (`select employee_name, status, can_review from public.v_goals` as Frank via the API shows `can_review = false`).

Sign in as **fb.b@test.com** (peer) → Ziele.
- [ ] 1.14 No review list; Fritz' goal isn't visible anywhere.

Sign in as **admin@test.com** (Erika, admin **with** an employee record) → Ziele.
- [ ] 1.15 Submit a goal as **user@test.com** (Max, Erika's report) first, then as Erika: **Zur Freigabe (1)** with Max; an admin may decide for anyone (also Fritz' next submitted goal).

Sign in as **vault@test.com** → `/vertrieb/ziele`.
- [ ] 1.16 "Ziele gibt es nur für aktive Mitarbeitende."

## 2. Cockpit — employee (`/vertrieb`) — spec §7.3, §7.5, §11.2

Sign in as **fa@test.com** → Vertrieb → **Cockpit**.
- [ ] 2.1 **Mein Monat**: tiles Punkte (anrechenbar) 100,00 P with the delta "ggü. Ziel 20 P" (+400 %), KV-Punkte 7,00, AE 2.800,00 (hint "Jahr: 100,00 P"), Provision nach Reserve 2.520,00 € ("In diesem Monat gebucht").
- [ ] 2.2 Activity tiles (Termine vereinbart/durchgeführt, Angebote, Nachfassen) show 0 with "ggü. Ziel 8" on Termine durchgeführt (−100 %) and a link "Aktivitäten erfassen".
- [ ] 2.3 **Prognose Monatsende** marked **Schätzung** with "Hochrechnung: bisheriges Tempo (d von n Tagen)" and "zum Vergleich … (Durchschnitt der letzten 3 abgeschlossenen Monate)" if older months have production (they don't in the fill → no comparison). Check the number: 100 P ÷ day-of-month × days-in-month.
- [ ] 2.4 **Karriere** box: meter "FA → FB" 100,00 / 100,00 P with the expected-pace marker, "KV-Punkte" 7,00 / 10,00; the sentence "Bei gleichem Tempo ca. … P zum Periodenende – das reicht." marked Schätzung with "Lineare Hochrechnung bis Periodenende (d von n Tagen)"; "Zeitraum bis 01.01.2027 (exklusiv). Details".
- [ ] 2.5 Trend chart "Anrechenbare Punkte je Monat …" with the current month at 100.
- [ ] 2.6 To-dos: after section 1 no "kein Ziel angelegt" line; enter a production draft as Fritz → "1 Produktions-Entwürfe noch nicht eingereicht. Öffnen".
- [ ] 2.7 Reload on another day (or `pvsql -c "alter database postgres set app.business_today = '…'"` is **not** available locally — skip): the forecast changes with the date, the meters don't.

Sign in as **nolevel@test.com** → Cockpit.
- [ ] 2.8 Karriere box: "Noch nicht berechenbar (no_level)." — acceptable for the person themselves? Note it if you want a German reason here (the Karriere page explains it in German).

Sign in as **vault@test.com** → Cockpit.
- [ ] 2.9 "Kein persönliches Vertriebsprofil verknüpft" with the hint to contact the Verwaltung; no error.

## 3. Cockpit — leader and admin — spec §7.3

Sign in as **tl2@test.com** → Cockpit.
- [ ] 3.1 **Meine Struktur**: "n Personen · x P im Monat"; rows Fritz Fleißig (FA) Eigen 100,00 / Struktur 0,00 / Ziel **Freigegeben** / Karriere "in Arbeit" (or "qualifiziert" if you completed §14.4 in the Phase 1 guide), Paula Punkte (FA) with her points, Nora Ohnestufe with Ziel "fehlt" and Karriere **"nicht berechenbar"** (P3-TEAM-01; never "blocked"). Igor (inactive) is not listed.
- [ ] 3.2 Hinweise (Phase 4 signals) only if there are any.

Sign in as **dl@test.com** → Cockpit.
- [ ] 3.3 Direct reports Tim and Tina with **Struktur** totals (Tim: Anna + Ali + Ben = 1.100 P; Tina: Fritz + Paula …) and team sizes; the header total counts the whole structure once (no double counting, §14.5).
- [ ] ⚠️ 3.4 Cancel one of Anna's contracts as finance → Tim's Struktur and the DL total drop at once; Anna's own tile too.

Sign in as **admin@test.com** → Cockpit.
- [ ] 3.5 **Datenqualität & Warteschlangen** lists only non-zero items with names: "1 aktive Personen ohne Karrierestufe" (Nora), "n aktive Personen ohne Platz in der Struktur" (Frank, Clara, Erika?), "1 abgelaufene Einladungen" (Ida) only after the invite expired, "1 eingereichte Verträge warten auf Bestätigung" (Paula's Strom), "Ziele warten auf Freigabe" while one is submitted, "vergangene Abrechnungsmonate nicht freigegeben" once a past month exists in `statement_periods`. Each links to the page that fixes it.

## 4. Profile & coaching (`/vertrieb/team/<id>`) — spec §8

Sign in as **tl2@test.com** → Vertrieb → **Team** → Fritz → **Profil & Coaching öffnen**.
- [ ] 4.1 Header "Fritz Fleißig · FA · seit 01.01.2026". **Gesprächsimpulse** (prompts): "Die Punkte für die nächste Stufe sind erreicht, es fehlen noch 3,00 KV-Punkte. Welche KV-Termine lassen sich einplanen?" and the line "Hinweise unterstützen das Gespräch, sie sind keine Bewertung." Tiles: Punkte letzte 3 Monate 100,00 P, Karriere "→ FB" with "fehlen 0,00 P / 3,00 KV-P", Produktmix "SACH · KV".
- [ ] 4.2 Trend chart (12 months) and **Ziele** list: "<Monat>: 100,00 von 20,00 P" with badge Freigegeben.
- [ ] ⚠️ 4.3 **Gespräch dokumentieren** (document a conversation): Datum today (future dates are blocked), Nächstes Gespräch in 2 weeks, Zusammenfassung "Monatsgespräch: Fokus KV-Beratung", Vereinbarte Maßnahme "Zwei KV-Termine pro Woche", Fällig bis in 1 week → **Gespräch speichern** → toast **Gespräch gespeichert**; the action appears under Vereinbarte Maßnahmen (unticked, "fällig …"), the conversation under Gespräche; the header now shows "nächstes Gespräch …".
- [ ] ⚠️ 4.4 **Notiz** "Wirkt unsicher bei Einwänden; Rollenspiel anbieten" with **Privat** ticked → **Notiz speichern** → listed with the badge **privat**. Add a second note with Privat unticked: "Gute Fortschritte bei der Terminquote" (shared).
- [ ] 4.5 Summary shorter than 3 characters → button disabled; 4.001 characters → "Ein Text ist zu lang …" (P3-COACH-01).

Sign in as **dl@test.com** → `/vertrieb/team/<Fritz' id>` (Dora is Tina's manager).
- [ ] 4.6 Both notes visible, the private one with the badge; the session and the action too; Dora may also document a conversation.

Sign in as **fa@test.com** → Cockpit.
- [ ] ⚠️ 4.7 Box **Vereinbarte Maßnahmen** with "Zwei KV-Termine pro Woche · bis …". Tick it → the box disappears (done). `/vertrieb/team/<own id>` is **not** reachable (team module is for leaders; "nicht freigeschaltet").
- [ ] 4.8 API as Fritz (DevTools → Network, or `curl` with his token): `coaching_notes` returns only the **shared** note; `coaching_sessions` returns the session.

Sign in as **admin@test.com** (Erika) → `/vertrieb/team/<Fritz' id>`.
- [ ] 4.9 Profile visible (prompts, trend, goals) but **no** Coaching entries, no "nächstes Gespräch", and **no forms** (P3-COACH-02). The same for a profile in her own structure (Max): forms shown, because she is his manager.

Sign in as **finance@test.com** and **compliance@test.com** → `/vertrieb/team/<Fritz' id>`.
- [ ] 4.10 "Profil nicht verfügbar." with "Dafür fehlt Ihnen die Berechtigung." (the team module may be closed for them before that — then the API: `rpc_performance_profile` → `forbidden`).

Sign in as **fb.b@test.com** → `/vertrieb/team/<Fritz' id>`.
- [ ] 4.11 Refused as well.
- [ ] 4.12 Audit: `pvsql -c "select action, new_values->>'body', new_values->>'summary' from audit.events where entity_type in ('public.coaching_notes','public.coaching_sessions') order by id"` → every text is `[redacted]`.
- [ ] 4.13 `pvsql -c "select app_private.run_task_generators();"` → Tina gets the task "Coaching-Gespräch mit Fritz Fleißig" (if the next review is within 7 days) and, once the action is overdue, Fritz gets "Überfällige Maßnahme: …" (Vertrieb → Aufgaben, bell).

## 5. Career simulator (`/vertrieb/karriere`) — spec §7.4

Sign in as **fa@test.com** → Vertrieb → **Karriere**.
- [ ] 5.1 Section **Simulation** with the badge "Schätzung – wird nicht gespeichert"; text "Bis FB fehlen 0,00 P und 3,00 KV-P. Eigene Produktion zählt immer vollständig."
- [ ] 5.2 Zusätzliche eigene KV-Punkte `3` → meters "Simuliert: Punkte für FB" 103,00 / 100,00 and "Simuliert: KV-Punkte" 10,00 / 10,00; "Mit diesen Annahmen wäre die Qualifikation für FB erreicht." Zusätzliche eigene Punkte (ohne KV) `50` instead → points 150, KV still 7 → "noch nicht qualifiziert".
- [ ] 5.3 Reload → the inputs are empty, the real meters unchanged (nothing stored).

Sign in as **tl@test.com** (Tim, target OL, 775 / 750) → Karriere.
- [ ] 5.4 Headroom lines: "Struktur Anna Alpha: Grenze erreicht – weitere Punkte zählen nicht", "Struktur Ben Beta: noch 75,00 P anrechenbar". Zusätzlich aus Struktur Anna `100` → simulated points unchanged (775); aus Struktur Ben `100` → 850 (only 75 of them count → 775 + 75 = 850).

## 6. Re-check of the fixed findings

| ID | Where | Expect |
|---|---|---|
| P3-TEAM-01 | 3.1 | `pvsql -c "delete from public.career_periods where employee_id = (select id from public.employees where email='fa@test.com')"` then reload Tina's cockpit → Fritz still "in Arbeit"/"qualifiziert", never "blocked"; Nora "nicht berechenbar" |
| P3-GOAL-01 | 1.13 | no review list for finance/compliance; API `rpc_review_goal` → `forbidden`; a refused decision shows the toast "Entscheidung nicht gespeichert" |
| P3-GOAL-02 | API | `rpc_submit_goal` / `rpc_review_goal` with a 4.001-character comment → `text_too_long` |
| P3-COACH-01 | 4.5 | `text_too_long`, `invalid_input` for owner/visibility, `date_in_future` |
| P3-COACH-02 | 4.9 | admin outside the structure: profile without forms; `rpc_performance_profile` → `can_coach: false` |
| P3-UI-01 | 1.12 | note on approved goals |
| P3-UI-02 | 4.7 | the checkbox shows the saving state and is disabled meanwhile |

## 7. UI/UX checklist

- [ ] Light **and** dark mode on `/vertrieb`, `/vertrieb/ziele`, `/vertrieb/team/<id>`, `/vertrieb/karriere`: the Schätzung badges, the Gesprächsimpulse box (gold), the Rückmeldung and approved-goal notes readable in both.
- [ ] 360 px: the cockpit tiles 2 × 2, the Meine Struktur table as cards, the goal form one column, the coaching forms stacked, the simulator inputs stacked.
- [ ] Keyboard: goal tabs with arrow keys; Tab reaches every field and button; Escape closes the return dialog.
- [ ] Toast titles name what happened ("Eingereicht", "Zurückgegeben", "Gespräch gespeichert", "Entscheidung nicht gespeichert").
- [ ] Numbers: German decimals everywhere, "–" for missing values, percentages with a space before %.
