# Phase 2 — Manual test guide (click by click)

This guide walks through the commission engine on your local app: ledger, statements, month workflow,
subsidies and the exception queue. Each step names the URL, what to click (German label, **English
meaning in parentheses**) and what you should see. Tick the boxes as you go (`- [x]`). Steps marked ⚠️
change data that later steps rely on, so keep the order. Write every deviation into
[r1-p2-verification.md](r1-p2-verification.md) (ID, steps, expected, actual).

---

## 0. Before you start

**Terminal**
```bash
npm run e2e:prepare        # WIPES the local DB: dev seed (all feature flags on) + Phase 1 people and production. ~40 s.
npm run dev                # app on http://localhost:5173
npm run totp -- finance@test.com   # 2FA code for finance actions (valid ~30 s); admin@test.com for admin actions
```
The fill confirms every production record **on today's date**, so all commission sits in the **current
month**. If you prefer the browser pass on top of the automated run, `npm run e2e` leaves the same data
plus the goals, coaching entries and subsidies the specs create.

**SQL helper** (`psql` isn't installed; this runs it inside the DB container):
```bash
alias pvsql='docker exec -i supabase_db_payload-vault psql -U postgres'
pvsql -c "select app_private.run_task_generators();"      # runs the task generators now (incl. subsidy review)
```

**Who is who** (password `123456` everywhere)

| Account | Person | Role in the Phase 2 story |
|---|---|---|
| fa@test.com | Fritz Fleißig | FA under Tina: 93 P Sach + 7 P KV → own statement 2.800,00 € |
| tl2@test.com | Tina Teamleiterin | TL: direct differential on Fritz and Paula |
| dl@test.com | Dora Direktor | DL: indirect differential on everyone below Tina and Tim |
| fb.b@test.com | Ben Beta | FB (ceiling 500 €): subsidy example |
| punkte@test.com | Paula Punkte | FA: cancelled and corrected contracts → reversal rows |
| nolevel@test.com | Nora Ohnestufe | no level: her confirmed production goes to the exception queue |
| finance@test.com | Frank Finanz | finance role (**2FA**): Abrechnung, Zuschuss, Prüfwarteschlange |
| admin@test.com | Erika Mustermann | admin (**2FA**): Regeln (reserve ratio), levels |
| vault@test.com | — | not an employee: "nur für aktive Mitarbeitende" |

Expected amounts (Stand 01.11.2026 rules, rates FA 28 / FB 56 / TL 70 / DL 112 € per point):

| Contract | Points | Fritz (self) | Tina (TL, 70 − 28 = 42) | Dora (DL, 112 − 70 = 42) |
|---|---|---|---|---|
| Fritz Sach 18.618,60 € | 93 | 2.604,00 / 260,40 / 2.343,60 | 3.906,00 / 390,60 / 3.515,40 | 3.906,00 / 390,60 / 3.515,40 |
| Fritz KV 196 € | 7 | 196,00 / 19,60 / 176,40 | 294,00 / 29,40 / 264,60 | 294,00 / 29,40 / 264,60 |

(gross / reserve / after reserve; the chain totals 112 € × points — nobody is paid twice.)

---

## 1. Own statement (`/vertrieb/provisionen`) — spec §6.1, §6.3, §14.2

Sign in as **fa@test.com** → Vertrieb → **Provisionen** (commission).

- [ ] 1.1 Four tiles: **Provision brutto** 2.800,00 €, **Reserve (10 %)** 280,00 € ("Einbehalten für Stornos"), **Nach Reserve** 2.520,00 € ("Vor sonstigen Abzügen"), **Zuschuss (genehmigt)** "–".
- [ ] 1.2 The table has three rows **Eigenproduktion (2)**, **Differenz direkte Struktur (0)**, **Differenz indirekte Struktur (0)** and a **Summe Provision** line. Nowhere does it say "netto" or "Auszahlung".
- [ ] 1.3 **Buchungen** lists 2 rows (Sach 2.604,00 €, KV 196,00 €), type "Eigen". Click the Sach row → dialog **Provisionsbuchung** (booking): Produktion (date · SACH · Fritz Fleißig), **Stufen am Produktionsdatum** "FA → FA", Punkte 93,00, Satz je Punkt 28,00 €, formula "Punkte × Satz = Brutto; Reserve = 10 % von Brutto", Brutto 2.604,00 € → Reserve 260,40 € → **Nach Reserve** 2.343,60 €. No OD notice on a personal row.
- [ ] 1.4 **CSV** downloads `provisionen_YYYY-MM.csv`; open it: semicolons, German decimals (`2604,00`), text cells intact. Check the log: `pvsql -c "select action, new_values from audit.events where action = 'export.statement' order by id desc limit 1"` → `rows: 2`.
- [ ] 1.5 Change **Abrechnungsmonat** (statement month) to last month → all tiles 0,00 € and "Keine Buchungen in diesem Monat"; the status badge shows **Offen**.
- [ ] 1.6 The notice at the bottom names **OD-05/OD-10** (differential rule and reserve release not yet confirmed).

Sign in as **tl2@test.com** → Provisionen.
- [ ] 1.7 **Differenz direkte Struktur** > 0 and the bookings list Fritz' rows as "Differenz" with 3.906,00 € and 294,00 €; Paula's rows too, including "(Rückbuchung)" rows for her cancelled KV (−280,00 €… no: for Tina the differential on 10 P is 420,00 € and −420,00 €). Click a differential row → "FA → TL", Differenzsatz 42,00 €, and the **OD-05** notice inside the dialog.
- [ ] 1.8 No "Abrechnung (Finanzen)" button for Tina.

Sign in as **dl@test.com** → Provisionen.
- [ ] 1.9 Fritz' and Paula's rows appear under **Differenz indirekte Struktur**; Tim's team rows too (Anna, Ben, Ali). Dora's own bucket is 0.

Sign in as **vault@test.com** → `/vertrieb/provisionen` (type the URL).
- [ ] 1.10 "Persönliche Abrechnungen gibt es nur für aktive Mitarbeitende." and no error toast (P2-UI-02).

## 2. Reversals and corrections — spec §5.4, §13.2

Sign in as **punkte@test.com** → Provisionen.
- [ ] 2.1 The cancelled KV ("KV storniert", 10 P) shows **two** rows: 280,00 € and a "(Rückbuchung)" row −280,00 €; together 0.
- [ ] 2.2 The corrected LV ("LV korrigiert 120 → 100 €") shows three rows: 352,79 €, −352,79 € (Rückbuchung), 293,99 €.
- [ ] 2.3 **Kfz 450 €** has points (0,45 P on Produktion) but **no** booking (Stand 01.11.2026: Kfz pays recurring commission only, not per point).

## 3. Finance workspace (`/vertrieb/provisionen/abrechnung`) — spec §6.2, §12.2

Sign in as **finance@test.com** **without** entering the 2FA code.
- [ ] 3.1 The yellow notice asks for the Zwei-Faktor-Anmeldung; **Zur Prüfung**, **Zuschuss speichern**, **Erneut buchen**, **Verwerfen** and the **CSV** button are disabled (P2-EXPORT-01). The overview table still loads (reads need no 2FA — decision S6).

Enter the code at Profil → **Sicherheit & Zwei-Faktor** (`npm run totp -- finance@test.com`), go back.
- [ ] 3.2 **Abrechnungsübersicht** for the current month lists Fritz, Tina, Dora, Paula, Tim's team (Anna, Ali, Ben), Tim and nobody else; Fritz' line 2.800,00 / 280,00 / 2.520,00, Zuschuss "–". Sorting by Brutto works.
- [ ] 3.3 **CSV** downloads `abrechnung_YYYY-MM.csv` and the log has `export.statement_overview` with the row count.

### Month workflow ⚠️ (use a **past** month, e.g. two months back, so bookings aren't affected)
- [ ] 3.4 Set **Abrechnungsmonat** two months back → badge **Offen**, button **Zur Prüfung** (to review). Click → dialog needs a **Begründung** (≥ 10 characters) → confirm → badge **In Prüfung**, buttons **Freigeben** (approve) and **Wieder öffnen** (reopen).
- [ ] 3.5 **Wieder öffnen** with a reason → **Offen** again. Then **Zur Prüfung** again.
- [ ] 3.6 **Freigeben** → the dialog warns "Nach der Freigabe ist der Monat unveränderlich …" → confirm → **Freigegeben**, only **Als ausgezahlt markieren** (mark as paid) left.
- [ ] 3.7 **Als ausgezahlt markieren** → **Ausgezahlt**, no buttons except CSV.
- [ ] 3.8 Try the **current** month: **Zur Prüfung** works, but **Freigeben** is refused with "Der Monat ist noch nicht abgelaufen." → **Wieder öffnen** it again (⚠️ leave the current month **Offen**, otherwise new bookings go to next month).
- [ ] 3.9 Audit: `pvsql -c "select reason, new_values->>'status' from audit.events where entity_type='public.statement_periods' order by id"` lists every step with your reasons.

### Subsidy ⚠️
- [ ] 3.10 **Person** "Beta, Ben (E2E-FB-B)", **Genehmigter Betrag** 600,00, **Deckungsgrundlage** (coverage basis) "Struktur B deckt den Zuschuss", **Begründung** "Zuschuss laut Vereinbarung" → **Zuschuss speichern** → red line "Über dem Höchstbetrag der Stufe, bei FA oder Teilzeit nur mit Ausnahme-Begründung."
- [ ] 3.11 Add **Ausnahme-Begründung** "Sondervereinbarung GF" → save → toast **Zuschuss gespeichert**; the overview shows Ben with Zuschuss 600,00 €.
- [ ] 3.12 Save 400,00 for Ben again (no exception needed) → the overview shows 400,00; `pvsql -c "select status, approved_amount from public.subsidy_records order by created_at"` → the 600 row is **superseded**, the 400 row **approved** (history kept).
- [ ] 3.13 Person "Fleißig, Fritz" (FA, no standard maximum), 100,00 → refused without an exception reason. 0,00 is always accepted.
- [ ] 3.14 Person "Inaktiv, Igor" is not offered (picker shows active people). Via API it is refused: `owner_inactive` (P2-SUBSIDY-01, e2e).
- [ ] 3.15 Switch to the month you marked **Ausgezahlt** in 3.7 and try a subsidy → "Der Monat ist freigegeben oder ausgezahlt und kann nicht mehr geändert werden."

Sign in as **fb.b@test.com** → Provisionen.
- [ ] 3.16 Tile **Zuschuss (genehmigt)** 400,00 € with hint "Höchstbetrag der Stufe: 500,00 €"; the commission tiles are unchanged (the subsidy is a separate line, §6.3).

### Subsidy review task (§11.2, P2-TASK-01) ⚠️
- [ ] 3.17 As finance, record 300,00 for "Alpha, Anna" for **last month** (set Abrechnungsmonat back one month first; reason "Zuschuss Vormonat"). Then `pvsql -c "select app_private.run_task_generators();"`.
- [ ] 3.18 Vertrieb → **Aufgaben** (tasks) as finance: "Zuschuss prüfen: Anna Alpha (MM.YYYY, Vormonat 300,00 €)" with the bell notification; the task links to the Abrechnung page.
- [ ] 3.19 Record 0,00 for Anna for the **current** month ("Volumen nicht gedeckt"), run the generators again → the task is gone (`select status, completion_note from public.tasks where type = 'subsidy_review'` → cancelled, "Zuschuss für den Monat entschieden").

## 4. Exception queue — spec §11.2, §16 ("do not guess")

⚠️ Sign in as **nolevel@test.com** (Nora, no level) → Vertrieb → Produktion → **Produktion erfassen**: KV, 280,00 € monatlich, today → **Speichern & einreichen**.
Sign in as **finance@test.com** (2FA) → Produktion → Nora's row → **Abrechnung bestätigen**.
- [ ] 4.1 Nora's record is **Abgerechnet** (10 P on her side), but Abrechnung → **Prüfwarteschlange (1)** lists "Produzent ohne Karrierestufe · Nora Ohnestufe · Produktionsdatum … · seit …" (P2-UI-03). Nothing is booked for Tina or Dora either.
- [ ] 4.2 **Erneut buchen** (book again) → toast "Noch nicht buchbar – die Ursache (z. B. fehlende Stufe) besteht weiterhin."
- [ ] 4.3 As **admin@test.com** (2FA): Verwaltung → Mitarbeitende → Nora → **Stufe ändern** → FA, effective 2026-01-01, reason. Back as finance: **Erneut buchen** → toast "4 Buchungen erstellt." (Nora, Tina, Dora … check: Nora FA 280, Tina 420, Dora 420 = 3 rows if Dora is the top; the toast counts the rows) and the queue is empty.
- [ ] 4.4 Repeat 4.1 with a second record, then press **Verwerfen** (dismiss) with a reason → the case disappears; `select status, resolution from public.exception_queue` shows **dismissed** with your reason. (A dismissed calculation can still be booked later with Erneut buchen — by design.)
- [ ] 4.5 The dashboard `/vertrieb` for finance/admin shows "n offene Fälle in der Prüfwarteschlange" linking here while a case is open.

## 5. Hierarchy change and historical integrity — spec §5.1, §14.3

- [ ] 5.1 As admin (2FA): Verwaltung → Hierarchie → move **Fritz** from Tina to **Tim**, effective **today**, reason. Then as Fritz enter and as finance confirm a new KV 280 € dated **today**.
- [ ] 5.2 Fritz' new booking pays **Tim** (TL, 42 €/P → 420,00 €) and Dora; Tina gets nothing for it. Fritz' **older** rows still pay Tina — the ledger keeps the chain on the production date. Tina still sees her old rows on her statement even though Fritz left her structure.

## 6. Rules: reserve ratio — spec §6.1, OD-10

Sign in as **admin@test.com** (2FA) → Verwaltung → **Regeln**.
- [ ] 6.1 The reserve ratio of the current levels version is 10 % (`pvsql -c "select label, reserve_ratio from public.rule_versions where kind='levels'"`). The UI doesn't edit it yet (Phase 1 finding R2, open); `rpc_update_reserve_draft` exists for a draft.
- [ ] 6.2 Statements label the reserve with the **booked** ratio ("Reserve (10 %)"), not a constant (P2-UI-01).

## 7. Re-check of the fixed findings

| ID | Where | Expect |
|---|---|---|
| P2-EXPORT-01 | 3.1 | CSV disabled without 2FA; API `rpc_log_export('statement_overview')` → `mfa_required` |
| P2-SUBSIDY-01 | 3.14 | `owner_inactive`; override reason > 500 → `reason_too_long`; note > 1.000 → `text_too_long` |
| P2-TASK-01 | 3.17–3.19 | task appears for every active finance user, closes after a decision |
| P2-UI-01 | 1.1, 1.3, 6.2 | "Reserve (10 %)" comes from the data |
| P2-UI-02 | 1.10 | no refused request for vault-only users (Network tab: no `rpc_statement` call) |
| P2-UI-03 | 4.1 | producer name in the queue; "ohne Stufe: …" names the ancestor for `ancestor_without_level` |

## 8. UI/UX checklist

- [ ] Light **and** dark mode on `/vertrieb/provisionen` and `/vertrieb/provisionen/abrechnung`: tiles, table, dialog, notices readable; the OD notice and the MFA notice use the warning tone.
- [ ] 360 px: the tiles stack (2 × 2), the bookings table switches to cards, the month picker and buttons wrap, the subsidy form is one column, the queue rows wrap without clipping.
- [ ] Keyboard: Tab reaches the month picker, every button and the table rows (Enter opens the dialog); Escape closes dialogs; focus returns to the row.
- [ ] Toast titles name what failed ("Export fehlgeschlagen", "Noch nicht buchbar"), never just "Fehler".
- [ ] The browser's `type="month"` picker: on Safari ≤ 14 it is a text field — type `2026-10`.
