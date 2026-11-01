# Phase 1 — Manual test guide (click by click)

This guide walks through every Phase 1 function on your local app. Each step names the URL, what to
click (German label, **English meaning in parentheses**) and what you should see. You judge design and
UX yourself along the way; this guide only covers *what the app must do*.

Tick the boxes as you go (`- [x]`). Steps marked ⚠️ change data that later steps rely on — keep the order.

---

## 0. Before you start

**Terminal**
```bash
npm run e2e:prepare        # fresh test data (WIPES the local DB). Takes ~40 s.
npm run dev                # if not running: app on http://localhost:5173
```

**2FA codes** (needed for admin and finance actions): in a second terminal
```bash
npm run totp -- admin@test.com      # prints a 6-digit code, valid ~30 s
npm run totp -- finance@test.com
```

**Logging in / out**
- Log in: http://localhost:5173/login → **E-Mail** (email) + **Passwort** (password) → **Anmelden** (sign in).
- Log out: avatar circle top right → **Abmelden** (sign out) → confirm **Abmelden**.
- Tip: keep the admin in your normal window and use a **private/incognito window** for the second person.

**Who is who** (all passwords `123456`)

| Account | Person | Role in the story |
|---|---|---|
| admin@test.com | Erika Mustermann | administrator (has 2FA) |
| user@test.com | Max Mustermann | ordinary adviser (FA) under Erika |
| vault@test.com | — | old account with only the personal vault ("Tresor"), no sales access |
| dl@test.com | Dora Direktor | top manager (DL) of the test structure |
| tl@test.com | Tim Teamleiter | team leader (TL) under Dora, leads Anna and Ben |
| fb.a@test.com | Anna Alpha | FB under Tim, leads Ali, big producer (800 points) |
| fa.a@test.com | Ali Alpha | FA under Anna (planned to move to Ben on 01.06.2027) |
| fb.b@test.com | Ben Beta | FB under Tim (exactly 300 points) |
| tl2@test.com | Tina Teamleiterin | team leader (TL) under Dora |
| fa@test.com | Fritz Fleißig | FA under Tina — has 100 points but too little health insurance (KV) |
| punkte@test.com | Paula Punkte | FA under Tina — one contract per product type |
| nolevel@test.com | Nora Ohnestufe | under Tina, **no career level set** |
| inactive@test.com | Igor Inaktiv | under Tina, **deactivated** |
| finance@test.com | Frank Finanz | finance department (has 2FA) |
| compliance@test.com | Clara Compliance | data protection / compliance |
| invited@test.com | Ida Wartend | invited, never accepted (cannot log in) |

**Words you will see**
- **Tresor** = the personal vault (own income documents and expenses) — exists for everybody.
- **Vertrieb** = the sales system (Phase 1 is its foundation).
- **Verwaltung** = administration area (admins only).
- **Punkte (P)** = career points from sold contracts. **KV / KV-P** = health insurance / its points.
  **AE** = "Abrechnungseinheit", 1 point = 28 AE.
- Career levels, lowest to highest: **FA** Finanzassistent, **FB** Fachberater, **TL** Teamleiter,
  **OL** Organisationsleiter, **DL** Direktionsleiter, **RL** Regionalleiter, **VD** Vertriebsdirektor.

---

## 1. Access: who sees what

*Purpose: the sales area is only for employees; each role sees exactly its menus; logged-out users are sent to the login.*

- [ ] **1.1 Login redirect.** Logged out, open http://localhost:5173/vertrieb/produktion
  → you land on the login page (URL contains `?from=%2Fvertrieb%2Fproduktion`).
  Log in as **fa@test.com** with a wrong password first → error message, you stay on the login.
  Then `123456` → **Anmelden** → you land back on **Produktion** (production).
- [ ] **1.2 Adviser menu (Fritz, fa@test.com).** Left sidebar shows **Mein Tresor** (my vault: Übersicht, Einnahmen, Steuerrelevante Ausgaben, Statistiken, Analysen), **Vertrieb** (sales: Cockpit, Produktion, Karriere, Provisionen, Ziele) and **Kunden & Leads** (customers & leads).
  It does **not** show **Team** or **Verwaltung**.
  Open http://localhost:5173/vertrieb/team → "Dieser Bereich ist für Sie nicht freigeschaltet." (this area isn't enabled for you). Same for http://localhost:5173/admin
- [ ] **1.3 Leader menu (Tim, tl@test.com).** Like Fritz, plus **Team** under Vertrieb. No Verwaltung.
- [ ] **1.4 Admin menu (Erika, admin@test.com).** Additionally the group **Verwaltung** (administration): Verwaltung, Mitarbeitende (employees), Hierarchie (hierarchy), Regeln (rules), Beförderungen (promotions), Lead-Einstellungen (lead settings).
- [ ] **1.5 Vault-only account (vault@test.com).** Only **Mein Tresor**. http://localhost:5173/vertrieb → "nicht freigeschaltet" (not enabled). No error messages.
- [ ] **1.6 Deactivated person (Igor, inactive@test.com).** Can still log in, sees only **Mein Tresor**; http://localhost:5173/vertrieb/produktion → "nicht freigeschaltet".

---

## 2. Two-factor login (2FA) and employee management

*Purpose: only invited people get accounts; admins manage employees and roles; every admin change requires a session confirmed with a 2FA code.*

Log in as **admin@test.com**.

- [ ] **2.1 Without 2FA everything is locked.** Open http://localhost:5173/admin/mitarbeiter
  → notice "Zwei-Faktor-Anmeldung erforderlich." (two-factor login required) with a link
  "Jetzt einrichten oder bestätigen" (set up or confirm now). The button **Mitarbeitende anlegen**
  (create employee) and all role chips are greyed out.
- [ ] **2.2 Confirm the session.** Avatar → **Sicherheit & Zwei-Faktor** (security & two-factor), or
  http://localhost:5173/profil/sicherheit. Status "Bestätigung nötig" (confirmation needed).
  Enter `12345` in **Code aus der Authenticator-App** (code from the authenticator app) → "Bitte den 6-stelligen Code aus der App eingeben." (please enter the 6-digit code).
  Enter a wrong 6-digit code → error "code wrong or expired".
  Run `npm run totp -- admin@test.com`, enter the code → **Sitzung bestätigen** (confirm session)
  → success message, status **Aktiv** (active).
- [ ] **2.3 The employee list.** Back to http://localhost:5173/admin/mitarbeiter — the notice is gone, buttons work. Check:
  - "Wartend, Ida" → Status **Eingeladen** (invited), with the button **Einladung senden** (send invitation)
  - "Inaktiv, Igor" → **Inaktiv** (inactive)
  - "Ohnestufe, Nora" → column **Stufe** (level) shows red **fehlt** (missing)
  - "Finanz, Frank" → role chip **Finanzen** (finance) highlighted; "Compliance, Clara" → **Datenschutz/Compliance** highlighted
  - column **Pers.-Nr.** (personnel number) shows `E2E-…` numbers
  - the search field (name, e-mail or personnel number) filters the list
- [ ] **2.4 Create an employee — validation.** **Mitarbeitende anlegen** (create employee) → click **Anlegen & einladen** (create & invite) with an empty form → the browser marks the required fields (Vorname / first name, Nachname / last name, E-Mail, Startdatum / start date).
  Fill Vorname `Nina`, Nachname `Neu`, E-Mail `Nina.Neu@Test.com`, Startdatum `01.11.2026`, Telefon (phone) `abc` → **Anlegen & einladen** → "Bitte eine gültige Telefonnummer angeben…" (please enter a valid phone number).
- [ ] ⚠️ **2.5 Create an employee — success.** Telefon `0170 1234567` → **Anlegen & einladen**
  → toast (Angelegt / created — the invite mail only goes out if `npm run functions-serve` is running; otherwise a toast says the invitation failed, the person is still created).
  The list shows "Neu, Nina", status **Eingeladen** (invited), Stufe **fehlt**.
- [ ] **2.6 Duplicate e-mail.** **Mitarbeitende anlegen** again with E-Mail `NINA.NEU@test.com` (other spelling) → "Für diese E-Mail-Adresse gibt es bereits einen Mitarbeitenden." (an employee with this e-mail already exists). **Abbrechen** (cancel).
- [ ] **2.7 (optional) Accept the invitation.** Only with `npm run functions-serve` running: open the mail inbox http://127.0.0.1:55324 → invitation mail → link → page **Passwort festlegen** (set password) → a password with at least 8 characters twice → **Passwort speichern** (save password). In the admin list Nina becomes **Aktiv**.
  *Re-sending:* as long as someone hasn't accepted, their row offers **Erneut einladen** (invite again) — e.g. when the link expired (1 h locally). It sends a fresh mail; the old link stops working.
- [ ] **2.8 Roles.** In the row "Mustermann, Max" click the chip **Finanzen** (finance) → dialog to grant the role → reason `kurz` → "Bitte mindestens 10 Zeichen angeben." (at least 10 characters). Reason `Finanzbuchhaltung ab November` → **Vergeben** (grant) → toast "Rollen aktualisiert" (roles updated), chip highlighted. Click it again → **Entziehen** (revoke) with a reason → chip back to normal.
- [ ] **2.9 The last admin can't remove herself.** Row "Mustermann, Erika" → chip **Administration** → reason → **Entziehen** (revoke) → "Der letzte Administrator kann nicht entfernt werden." (the last administrator cannot be removed).
- [ ] **2.10 No self-deactivation.** Row "Mustermann, Erika" → **⋯** (Aktionen / actions) → there is **no** "Deaktivieren" (deactivate).
- [ ] ⚠️ **2.11 Deactivate and reactivate.** First give Max the role **Finanzen** again (as in 2.8) — it shows that roles rest while someone is deactivated.
  Row "Mustermann, Max" → **⋯** → **Deaktivieren** (deactivate) → reason `Vertrag beendet zum Monatsende` (contract ends at month end) → confirm → status **Inaktiv**. The **Finanzen** chip stays highlighted in the admin list (the role is kept, so reactivating restores it).
  In the private window log in as **user@test.com** (or reload if he is still logged in) → only **Mein Tresor**: no **Provisionen** (commissions), no **Verwaltung**; http://localhost:5173/vertrieb/provisionen/abrechnung and http://localhost:5173/vertrieb → "nicht freigeschaltet"; http://localhost:5173/einnahmen (his own vault) still works.
  Back as admin: row Max → **Reaktivieren** (reactivate) with a reason → **Aktiv**. Max reloads → the Vertrieb menu (with Provisionen and the finance view) is back. Remove the **Finanzen** role again (2.8) so the later steps match.

---

## 3. Hierarchy: who reports to whom

*Purpose: a dated reporting structure. Leaders see exactly the people below them (also indirect), nobody sees more. Changes are dated, can be planned for the future, and circles are impossible.*

- [ ] **3.1 Tim's team (tl@test.com).** http://localhost:5173/vertrieb/team → tree "Struktur heute" (structure today), **fully expanded** without clicking: **Teamleiter, Tim** (3 im Team / 3 in the team) with **Alpha, Anna** → **Alpha, Ali**, and **Beta, Ben**. Not visible: Dora, Tina, Fritz.
  **Alle zuklappen** (collapse all) → only Tim; the arrow next to a name opens one level; **Alle aufklappen** (expand all) → everyone again.
  Click a person → the side panel shows personnel number, status, **Direkt** (direct reports) and **Gesamt** (whole team).
- [ ] **3.2 Anna's team (fb.a@test.com).** Only Anna and Ali.
- [ ] **3.3 Ben (fb.b@test.com).** Only Ben (Ali's move to Ben is planned for 2027, not today).
- [ ] **3.4 Dora (dl@test.com).** Everyone below her at once: Tim → Anna → Ali, Ben; Tina → Fritz, Paula, Nora, Igor. "9 im Team". Igor is marked inactive. No "Mustermann".
- [ ] **3.5 Fritz (fa@test.com).** No **Team** in the menu.

Now as **admin@test.com** with confirmed 2FA (step 2.2), http://localhost:5173/admin/hierarchie:

- [ ] **3.6 History with a planned move.** **Person** (person) → choose "Alpha, Ali" → section **Verlauf** (history):
  "01.01.2026 – 01.06.2027" marked **Aktuell** (current), and "01.06.2027 – offen" (open) marked **Geplant** (planned), with the reason.
- [ ] **3.7 Circle refused.** **Person** "Direktor, Dora", **Führungskraft ab Stichtag** (manager from the effective date) "Alpha, Ali", **Gültig ab** (valid from) today, **Begründung** (reason) `Test Kreis` → **Zuordnung speichern** (save assignment)
  → "Diese Zuordnung würde einen Kreis in der Struktur erzeugen." (would create a circle).
- [ ] **3.8 Before the start date refused.** Person "Teamleiter, Tim", manager "Teamleiterin, Tina", Gültig ab `01.12.2025` → "Das Datum liegt vor dem Eintrittsdatum." (before the start date).
- [ ] **3.9 Earlier than a planned move refused.** Person "Alpha, Ali", manager "Teamleiterin, Tina", Gültig ab `01.01.2027` → "Es gibt bereits einen geplanten Wechsel…" (a planned change already exists).
- [ ] **3.10 No back-dating.** Person "Beta, Ben", manager "Teamleiterin, Tina", Gültig ab `01.03.2026` (in the past) → "Eine bestehende Zuordnung kann nur ab heute oder für die Zukunft geändert werden." (an existing assignment can only change from today or later). Nothing is saved.
- [ ] ⚠️ **3.11 Cancel the planned move.** Person "Alpha, Ali" → in Verlauf at the **Geplant** row **Absagen** (cancel) → reason `Wechsel zu Ben findet nicht statt` → **Absagen** → toast "Abgesagt" (cancelled). The current row now ends "– offen" (open-ended), and the cancelled move **stays in the history**: crossed-out "Beta, Ben", "geplant ab 01.06.2027", badge **Abgesagt** (cancelled), "Abgesagt am <date, time> von Erika Mustermann – Wechsel zu Ben findet nicht statt". It no longer has an **Absagen** button and doesn't count in the structure.
- [ ] **3.12 A new move.** Person "Neu, Nina" (from 2.5), manager "Teamleiterin, Tina", Gültig ab `01.11.2026` (her start), reason → **Zuordnung speichern** → saved; Nina's Verlauf shows it.

---

## 4. Rules: career levels and point conversion

*Purpose: the official rule book from the spec — levels with rate per point, subsidy, points threshold, KV minimum, structure cap — and how premiums turn into points. Rules are versioned: changes go into a draft that can only become valid in the future, and only if it is consistent.*

As **admin@test.com** with 2FA: http://localhost:5173/admin/regeln

- [ ] **4.1 Career levels ("Karrierestufen & Sätze").** Table must read:

  | Stufe | Satz/P (rate/point) | Max. Zuschuss (max subsidy) | Schwelle (threshold) | KV-Anteil (KV share) | Strukturgrenze (structure cap) |
  |---|---|---|---|---|---|
  | FA | 28,00 € | – | 0 P | 10 % | – |
  | FB | 56,00 € | 500,00 € | 100 P | 10 % | – |
  | TL | 70,00 € | 1.000,00 € | 300 P | 10 % | – |
  | OL | 92,00 € | 1.500,00 € | 750 P | 10 % | 50 % |
  | DL | 112,00 € | 2.500,00 € | 1.500 P | 10 % | 50 % |
  | RL | 132,00 € | 3.500,00 € | 4.000 P | 10 % | 50 % |
  | VD | 144,00 € | 6.000,00 € | 9.000 P | 10 % | 50 % |
- [ ] **4.2 Point conversion ("Punkteumrechnung").** LV (life insurance) divisor 4.000, max. 35 Jahre (years); KV (health) 28; SACH (property) 200; KFZ (car), STROM (electricity), GAS: no points. AE je Punkt (AE per point) 28.
- [ ] **4.3 Create a draft.** Under the levels table: **Neuer Entwurf** (new draft) name `Test`, **Gültig ab** (valid from) = 1st of next month → **Entwurf anlegen** (create draft) → badge **Entwurf** (draft) and an editor with one block per level.
- [ ] **4.4 Change is highlighted.** Block "FB – Fachberater": **Satz/P** `58` → **Speichern** (save) → the field is highlighted (differs from the current rules).
- [ ] **4.5 Inconsistent draft refused.** Block "TL – Teamleiter": **Satz/P** `50` → **Speichern** → **Veröffentlichen…** (publish) → reason → **Veröffentlichen** → "Sätze und Schwellen müssen von Stufe zu Stufe steigen." (rates and thresholds must rise from level to level). Close the dialog.
- [ ] **4.6 Discard.** **Entwurf verwerfen** (discard draft) → the draft is gone; the tables are unchanged.
- [ ] ⚠️ **4.7 Set a career level.** http://localhost:5173/admin/mitarbeiter → row "Ohnestufe, Nora" → **⋯** → **Stufe ändern** (change level) → dialog to set the starting level → Stufe **FA**, Gültig ab `01.01.2026`, reason (prefilled) → **Speichern** → toast "Stufe gespeichert" (level saved); column Stufe shows **FA**.
  Open **⋯ → Stufe ändern** again with the same level → "Das entspricht bereits dem aktuellen Stand." (that's already the current state).

---

## 5. Production and points

*Purpose: advisers record contracts they sold. The app converts the premium into points (P) and AE with the formula of the product. Points only count after the finance department confirms the contract ("Anrechenbar" = eligible). Cancelling or correcting never deletes anything — it books a reversal, so the history stays complete. Admins can import contracts from a CSV file.*

**Statuses:** Entwurf (draft) → Eingereicht (submitted) → Anrechenbar (eligible, counts) → or Storniert (cancelled).

Log in as **punkte@test.com** (Paula): http://localhost:5173/vertrieb/produktion

- [ ] **5.1 Paula's contracts.** Columns: Datum (date), Sparte (product), Beitrag (premium), Status, Punkte (points), AE.

  | Sparte | Beitrag | Status | Punkte | AE | Why |
  |---|---|---|---|---|---|
  | LV | 100,00 € mtl. (monthly) | Anrechenbar | 10,50 | 294 | 100 × 12 × 35 years ÷ 4000 |
  | KV | 700,00 € mtl. | Anrechenbar | 25,00 | 700 | 700 ÷ 28 |
  | SACH | 1.000,00 € jährl. (yearly) | Anrechenbar | 5,00 | 140 | 1000 ÷ 200 |
  | KFZ | 450,00 € | Anrechenbar | 0,00 | 0 | car insurance gives no points |
  | LV | 100,00 € mtl. (40 years) | Anrechenbar | 10,50 | 294 | term capped at 35 years |
  | KV | 333,33 € mtl. | Anrechenbar | 11,90 | 333 | 333,33 ÷ 28 = 11,9046 |
  | KV | 280,00 € mtl. | Storniert (cancelled) | 0,00 | 0 | was 10 P, reversed |
  | LV | 100,00 € mtl. | Anrechenbar | 10,50 | 294 | corrected from 120 € |
  | STROM | 80,00 € mtl. | Eingereicht (submitted) | 0,00 | 0 | waiting for finance |
  | GAS | 60,00 € mtl. | Entwurf (draft) | 0,00 | 0 | not submitted yet |

  Paula has **no** "Anrechenbar" button (she can't confirm her own contracts) and **no** "CSV-Import" button.
- [ ] **5.2 Where does the number come from?** Click the row **KV 333,33 €** (or **⋯ Weitere Aktionen → Details anzeigen** / more actions → show details).
  The dialog "Produktion vom …" shows: **Eingaben** (inputs: Sparte, Beitrag, date), **Formel** (formula) `333.33 ÷ 28`, **Rechenweg** (calculation): **Ergebnis exakt** (exact result) 11.9046428…, **AE je Punkt** 28, **Punkte (gerundet)** (rounded) 11,90; **Buchungen** (bookings): one calculation; **Verlauf** (history): created by Paula → submitted → confirmed by Frank Finanz, each with time.
- [ ] **5.3 A corrected contract.** Open the LV rows with 100,00 € until you find the one with **Rückbuchung** (reversal) under Buchungen: calculation **12,60 P** → reversal **-12,60 P** with the reason "Beitrag laut Police korrigiert" (premium corrected per policy) → new calculation **10,50 P**. Verlauf shows "premium_amount 120 → 100" with the reason.
- [ ] **5.4 A cancelled contract.** Row **KV 280,00 €** → Buchungen: 10,00 P → reversal -10,00 P with the reason.
- [ ] **5.5 Entry form with live preview.** **Produktion erfassen** (record production) →
  - **Sparte** (product) "Lebensversicherung", **Beitrag** `100,00`, **Laufzeit** (term) `35` → preview **10,50 P / 294 AE**
  - **Laufzeit** `40` → notice "Laufzeit über 35 Jahre wird in der Formel mit 35 Jahren gerechnet." (terms over 35 years count as 35), still 10,50 P
  - **Sparte** "Sachversicherung", **Netto/Brutto** "Brutto" (gross) → message that the yearly *net* premium is required
  - **Sparte** "Krankenversicherung" → **Rhythmus** (payment rhythm) is locked to monthly
  - **Produktionsdatum** (date) `31.12.2025` → no rules exist for that date
  - **Abbrechen** (cancel)
- [ ] ⚠️ **5.6 Save, submit, delete a draft.** **Produktion erfassen** → "Krankenversicherung", Beitrag `56,00` → **Als Entwurf speichern** (save as draft) → new row **Entwurf**. On that row **Einreichen** (submit) → **Eingereicht**. Make another draft and remove it: **⋯ → Entwurf löschen** (delete draft) → gone.
- [ ] **5.7 Visibility.** Log in as **fa@test.com** (Fritz) → Produktion shows only his 2 contracts. Log in as **tl2@test.com** (Tina) → she sees her team's contracts (Fritz, Paula) with a **Person** column.

Log in as **finance@test.com** (Frank Finanz) and confirm 2FA (step 2.2 with `npm run totp -- finance@test.com`):

- [ ] ⚠️ **5.8 Finance confirms.** http://localhost:5173/vertrieb/produktion → everyone's contracts. Row "Punkte, Paula · STROM 80,00 €" → **Anrechenbar** (confirm as eligible) → toast "Als anrechenbar bestätigt." → status Anrechenbar, 0,00 P (Strom gives no points). Also confirm Paula's KV 56,00 € from 5.6 → 2,00 P.
- [ ] ⚠️ **5.9 Finance cancels.** Paula's KV 56,00 € → **⋯ → Stornieren** (cancel) → reason `kurz` → refused (min. 10 characters); reason `Kunde hat widerrufen` (customer withdrew) → **Stornieren** → status Storniert, points 0, Buchungen show the reversal.

As **admin@test.com** with 2FA:

- [ ] ⚠️ **5.10 CSV import.** http://localhost:5173/vertrieb/produktion → **CSV-Import** → **Quellsystem** (source system) `E2E` → choose a file with this content (save as `import.csv`, UTF-8; replace `31.10.2026` with today's date):
  ```
  Quelle-ID;Pers.-Nr.;Sparte;Beitrag;Rhythmus;Netto/Brutto;Laufzeit;Datum;Referenz
  IMP-001;E2E-PUNKTE;LV;100,00;monatlich;;35;31.10.2026;Import LV gültig
  IMP-002;E2E-PUNKTE;SACH;2.000,00;jährlich;netto;;31.10.2026;Import Sach gültig
  IMP-002;E2E-PUNKTE;SACH;2.000,00;jährlich;netto;;31.10.2026;doppelte Quelle-ID
  IMP-003;E2E-UNBEKANNT;KV;100,00;monatlich;;;31.10.2026;unbekannte Pers.-Nr.
  IMP-004;E2E-PUNKTE;SACH;1.000,00;jährlich;brutto;;31.10.2026;Sach brutto
  IMP-005;E2E-PUNKTE;KV;abc;monatlich;;;31.10.2026;keine Zahl
  ;E2E-PUNKTE;KV;100,00;monatlich;;;31.10.2026;fehlende Quelle-ID
  ```
  → **Prüfen** (check) → table with column **Prüfung** (check result): rows IMP-001 and the first IMP-002 OK; the others each with a German reason (duplicate ID in file, unknown personnel number, net premium required, invalid number, missing source ID).
  → **2 gültige Zeilen übernehmen** (take over 2 valid rows) → success message; Paula's list now has the two contracts as **Eingereicht**.
- [ ] **5.11 No double import.** Same file again → **Prüfen** → the rows show "Bereits importiert" (already imported); the button reads **0 gültige Zeilen übernehmen** and is disabled.
- [ ] **5.12 Import is admin-only.** As **user@test.com**: http://localhost:5173/vertrieb/produktion/import → "Nur für die Verwaltung." (administration only).

---

## 6. Career: progress and promotion

*Purpose: within the current career year, the app adds up each person's confirmed points (own contracts plus the team below, attributed by the hierarchy on the contract date) and checks the next level's rules: enough points AND at least 10 % of them from health insurance (KV). From target level OL upward, one team below counts at most half of the threshold. Qualified people appear in a queue; an admin approves the promotion, and counting starts again for the next level.*

http://localhost:5173/vertrieb/karriere — log in as each person:

- [ ] **6.1 Fritz (fa@test.com) — enough points, too little KV.** "FA → FB", status **In Arbeit** (in progress); period "Erstes persönliches Karrierejahr" (first personal career year) 01.01.2026 – 31.12.2026; **Punkte für FB** (points for FB) **100,00 / 100,00 P**; **davon KV-Punkte** (of which KV points) **7,00 / 10,00 KV-P** — 3 KV points missing.
- [ ] **6.2 Paula (punkte@test.com).** 73,40 / 100,00 P; KV 36,90 / 10,00; **In Arbeit**.
- [ ] **6.3 Ben (fb.b@test.com) — exactly at the threshold.** "FB → TL"; 300,00 / 300,00 P; KV 40,00 / 30,00; **Qualifiziert – Freigabe ausstehend** (qualified – approval pending).
- [ ] **6.4 Anna (fb.a@test.com).** 800,00 / 300,00 P; KV 80,00 / 30,00; **Qualifiziert**.
- [ ] **6.5 Tim (tl@test.com) — the 50 % structure cap.** "TL → OL"; **775,00 / 750,00 P**; **77,50 / 75,00 KV-P**; **Qualifiziert**. Table **Herkunft der Punkte** (where the points come from): own production 100; structure **Anna Alpha** produced 800,00 → credited **375,00** (KV 37,50) with badge **begrenzt** (capped); structure **Ben Beta** 300,00 → 300,00 (KV 40,00). Notices with the open decisions (OD-xx) are shown.
  *Why 375: for target OL (threshold 750) one structure may count at most 50 % = 375.*
- [ ] **6.6 Dora (dl@test.com).** "DL → RL"; 1.373,40 / 4.000,00 P; In Arbeit (nothing capped: the RL cap is 2.000 per structure).
- [ ] **6.7 Nora (nolevel@test.com).** "Kein Fortschritt berechenbar" (no progress can be calculated) — she has no level. *(If you did 4.7, she now shows FA → FB with 0 points.)*
- [ ] **6.8 Leaders look at their people.** As **tl@test.com**: field **Person** → "Alpha, Anna" → Anna's progress.

As **admin@test.com** with 2FA: http://localhost:5173/admin/befoerderungen

- [ ] **6.9 Promotion queue.** Without 2FA: "Die Warteschlange wird nach der Bestätigung angezeigt." (queue appears after confirmation). With 2FA, **Qualifizierte Mitarbeitende** (qualified employees): **Anna Alpha FB → TL**, **Ben Beta FB → TL**, **Tim Teamleiter TL → OL** — not Fritz, not Paula.
- [ ] ⚠️ **6.10 Fritz completes the KV minimum (spec §14.4).** As **fa@test.com** → Produktion → **Produktion erfassen** → "Krankenversicherung", Beitrag `84,00` (preview 3,00 P) → **Speichern & einreichen** (save & submit).
  As **finance@test.com** (2FA) → Fritz's KV 84,00 € → **Anrechenbar**.
  Fritz → Karriere: **103,00 / 100,00 P**, **10,00 / 10,00 KV-P**, **Qualifiziert**. The admin queue now also lists Fritz.
- [ ] ⚠️ **6.11 Approve a promotion.** In the queue, row **Ben Beta** → **Freigeben** (approve) → dialog "Beförderung freigeben" (approve promotion) → reason `Qualifikation erreicht laut Karriereprüfung` → **Zu TL befördern** (promote to TL) → toast "Befördert" (promoted); Ben leaves the queue.
  As **fb.b@test.com** → Karriere: now "TL → OL" with **0,00 / 750,00 P** and the note "gezählt ab <tomorrow> (Stufenwechsel)" (counted from tomorrow, level change). The promotion day itself still belongs to the old level, so contracts dated today don't count twice.

---

## 7. Audit trail

*Purpose: every sensitive change is stored with who, when, old → new and why; nobody can change or delete it.*

- [ ] **7.1 In the app.** Any production record → **Verlauf** (history): who created, submitted, confirmed, cancelled or corrected it, when, and with which reason (see 5.2–5.4).
- [ ] **7.2 (optional) In the database.** Supabase Studio http://127.0.0.1:55323 → **SQL Editor** → run
  `select at, action, entity_type, reason, new_values from audit.events order by id desc limit 30;`
  → your actions from this guide (employee created, role granted/revoked, deactivation, level, hierarchy, production…), each with its reason.
  Then `update audit.events set reason = 'x';` → error `audit_append_only` (the log cannot be changed).

---

## 8. Fixed review findings — check them yourself (optional, run `npm run e2e:prepare` afterwards)

These were confirmed defects from the review (details in `r1-p1-verification.md`, section 3); all are fixed now.
Each step shows what used to go wrong and what you should see instead.

- [ ] **H1 — back-dated hierarchy change.** Covered by step 3.10: a past **Gültig ab** for someone who already has a manager is refused. (Someone's *first* assignment may still start in the past, e.g. at their start date.)
- [ ] **C1 — deactivated people kept their roles.** Covered by step 2.11. Also: give Max **Administration**, deactivate him → as user@test.com there is **no** **Verwaltung** in the menu. Reactivate, then remove the role again.
- [ ] **K1 — promotion-day contracts counted twice.** Covered by step 6.11: Ben starts at 0 points towards OL.
- [ ] **P2 — duplicate import with a different source spelling.** Repeat 5.10 with **Quellsystem** `e2e` (lower case) → **Prüfen** → the already imported rows say "Bereits importiert" (already imported).
- [ ] **P1 — an "OK" import row broke the whole import.** Import one line `IMP-100;E2E-PUNKTE;KFZ;500,00;quartalsweise;;;31.10.2026;` (today's date) → **Prüfen** → the row already shows "Ungültiger Zahlungsrhythmus. Erlaubt sind monatlich, jährlich und einmalig." (invalid payment rhythm); nothing to take over.
- [ ] **P5 — English number/date formats.** Import one line `IMP-101;E2E-PUNKTE;KV;1,234.50;monatlich;;;31.10.2026;` → the row is refused ("Ungültiger Wert" / invalid value) instead of being read as 1,23 €. Same for a date like `10/31/2026`.
- [ ] **C3 — self-signup.** http://localhost:5173/signup → any new e-mail and password → "Konten werden nur per Einladung angelegt…" (accounts are created by invitation only).
