# Phase 5 — Manual test guide (click by click)

This guide walks through every Phase 5 function (customers, lead conversion, consents, contract links,
service reminders, privacy operations) on your local app. Each step names the URL, what to click (German
label, **English meaning in parentheses**) and what you should see. Like the Phase 4 guide it also has a
UI/UX checklist (§9), a performance part (§10) and the findings of the review pass (§11).

Tick the boxes as you go (`- [x]`). Steps marked ⚠️ change data that later steps rely on — keep the order.
Write every deviation into [r1-p5-verification.md](r1-p5-verification.md).

---

## 0. Before you start

```bash
npm run e2e:prepare          # WIPES the local DB: dev seed (all flags on) + Phase 1 people
npm run dev
alias pvsql='docker exec -i supabase_db_payload-vault psql -U postgres'
```

**2FA codes.** The fill enrols admin and finance. Compliance needs 2FA for every privacy action, so enrol it
once after each `e2e:prepare` (log in as compliance@test.com → `/profil/sicherheit` → set up with an
authenticator app), or run the helper used in the review:
```bash
node --input-type=module -e '
import { enrollTotp, signIn } from "./e2e/lib/api.mts";
import { readState, writeState } from "./e2e/lib/state.mts";
const s = readState(); const e = await enrollTotp(await signIn("compliance@test.com"));
s.totp["compliance@test.com"] = { secret: e.secret, factorId: e.factorId }; writeState(s);'
npm run totp -- compliance@test.com
```

**Cast** (password `123456`): Ali (fa.a@) adviser · Anna (fb.a@) his manager · Tim (tl@) leader ·
Ben (fb.b@) peer · Tina (tl2@) other structure · admin@ (2FA) · finance@ (2FA) · compliance@ (2FA after
the step above) · vault@ (not an employee).

**Words**: **Kunde** = customer · **Betreuung** = adviser · **Einwilligung** = consent ·
**Rechtsgrundlage** = legal basis · **Widerspruch** = objection (opt-out of all contact) · **Vertrag** =
contract · **Hauptfälligkeit** = renewal date · **Serviceanlass** = service item · **Betroffenenanfrage** =
data subject request · **Auskunft / Löschung / Berichtigung** = access / erasure / rectification.

---

## 1. What is new in the UI

| Where | New UI |
|---|---|
| Sidebar → **Kunden & Leads** → **Kunden** | customer list: tabs Meine Kunden / Team (leaders) / Alle (compliance, admins without employee record) / Archiviert; search by name, company, K-number, phone, e-mail, postcode; „Kunde anlegen“; links **Kommunikation** and **Datenschutz** for compliance/admins |
| „Kunde anlegen“ modal | CustomerForm (birth date „nur wenn nötig“, status, channel incl. Brief, address), DuplicateWarning, adviser picker for leaders |
| `/vertrieb/kunden/[id]` | header with K-number and status; **Kontakt- und Beratungshistorie** (ActivityPanel), **Verträge** (ContractsCard), **Service & Termine** (ServiceCard), E-Mail history; aside **Profil** (Bearbeiten, Archivieren), **Nächstes Nachfassen**, **Betreuung** (reassign with reason), **Einwilligungen & Kommunikation** (ConsentCard) |
| Lead detail | „In Kunden umwandeln“ (customer duplicate check first), afterwards „Zum Kunden →“ |
| `/vertrieb/kunden/datenschutz` | requests (form + open list + closed), consent overview, retention (OD-16 notice), export log, sync runs (admins) |
| Bell / tasks | `customer_service` („Service: …“), `customer_follow_up` („Kunde nachfassen“), `customer_assigned`; system tasks close themselves (Phase 4 change) |

---

## 2. Access: who sees what

- [ ] **2.1 Ali**: Kunden shows „Meine Kunden“ and „Archiviert“, „Kunde anlegen“; no Datenschutz link.
- [ ] **2.2 Tim**: plus „Team“; sees Ali's customers, can reassign them.
- [ ] **2.3 Ben / Tina**: none of Ali's customers; their URLs → „Kunde nicht gefunden oder keine Berechtigung“.
- [ ] **2.4 Compliance**: sees every customer, read-only (no forms, no action buttons); Datenschutz and
  Kommunikation links.
- [ ] **2.5 Finance**: no other people's customers. (Finance users who are also employees see their own.)
- [ ] **2.6 Admin without 2FA**: forms are shown, but saving fails with the 2FA message (P5-UX-03).
- [ ] **2.7 vault@**: „nicht freigeschaltet“ / „nur für aktive Mitarbeitende“.

## 3. Customers

- [ ] ⚠️ **3.1 Create.** Ali → **Kunde anlegen** → Vorname `Karla`, Nachname `Kunde`, Telefon `0171 1112223`,
  E-Mail, PLZ `80331`, Ort `München` → saved, detail opens; phone stored as `+491711112223`.
- [ ] **3.2 Duplicate.** Same phone again → „Mögliche Duplikate gefunden“, save only after ticking the box.
  As Tina the duplicate shows „Kunde einer anderen Person“ only.
- [ ] **3.3 Validation.** No last name/company → disabled; invalid phone/e-mail → inline error; birth date
  in the future → not selectable.
- [ ] **3.4 Search.** By name, K-number, e-mail, postcode, `+49171…`, **`0171 …`** (fails today, P5-UI-01).
- [ ] **3.5 Edit** (Profil → **Bearbeiten**): change city → saved. Notes with > 4,000 characters → error
  message (raw today, P5-API-01).
- [ ] ⚠️ **3.6 Follow-up.** **Nächstes Nachfassen** → date tomorrow, time `10:00` → **Planen**; a past date is
  accepted (P5-UX-05); time `25:99` → nothing happens, console error (P5-REG-01).
- [ ] **3.7 Reassign.** Tim → **Betreuung** → Ben, reason < 10 → disabled; valid reason → history line, Ben
  notified, Ali loses access.
- [ ] **3.8 Archive / reactivate** with reason → leaves/returns to „Meine Kunden“; shown in „Archiviert“.

## 4. Lead → customer

- [ ] ⚠️ **4.1** Ali converts a lead with „Rechtsgrundlage Kontakt: Einwilligung“ → customer opens; lead shows
  „Gewonnen“ and „Zum Kunden →“; customer shows „Frühere Aktivitäten als Lead: zum Lead“; consents Anruf and
  E-Mail (Service) granted with source „aus Lead“.
- [ ] **4.2** Convert again → „bereits umgewandelt“. Pool lead → „muss zuerst zugewiesen werden“.
- [ ] **4.3** Convert a lead whose phone matches an existing customer → customer duplicate warning first.

## 5. Consents

- [ ] **5.1** New customer: every purpose „keine Rechtsgrundlage erfasst“; Geburtstagsgrüße „kein
  Geburtsdatum hinterlegt“.
- [ ] **5.2** Werbe-E-Mails · erteilt · Einwilligung without Nachweis → disabled; with Nachweis → „erlaubt“.
- [ ] **5.3** Withdraw, then record a back-dated grant (Wirksam am last year) → stays „widerrufen“.
- [ ] **5.4** **Widerspruch: keine Kontaktaufnahme** → every purpose blocked, badge in the header. Note: one click,
  no confirmation, takes source/evidence from the form (P5-UX-01). **Widerspruch aufheben** restores.
- [ ] **5.5** Verlauf lists every entry with source and evidence.
- [ ] **5.6** Compliance cannot record anything here (read-only) — so an „Widerspruch“ privacy request can't be
  carried out by compliance (P5-PRIV-01).

## 6. Contracts

- [ ] **6.1** **Verknüpfen** → number `LV-1`, Sparte LV → listed (title shows the raw code „LV“, P5-UI-02).
- [ ] **6.2** Same number again → „existiert bereits“. Dates without the „geprüft“ box → disabled.
- [ ] **6.3** `http://…` link → „Nur https-Links“. End before start → raw database error (P5-API-01).
- [ ] **6.4** „Quelle der Nummer: Vertragsportal“ in the manual form → saved as source „portal“, still
  removable (P5-UX-06).
- [ ] **6.5** **Kundennummer im Vertragsportal** `P-1001` → saved. Sync as service role:
  ```bash
  pvsql -c "set role service_role; select public.rpc_ingest_contracts('portal', '[{\"external_customer_id\":\"P-1001\",\"external_contract_id\":\"V-1\",\"status\":\"active\",\"renewal_date\":\"2027-03-01\"},{\"external_customer_id\":\"x\",\"external_contract_id\":\"V-2\"}]');"
  ```
  → V-1 appears „synchronisiert …“ with „laut Vertragsportal“, no Entfernen; run status „teilweise“ on the
  Datenschutz page (admin); `sync_errors` holds only codes.

## 7. Service items and tasks

- [ ] **7.1** „Hauptfälligkeit“ offers only contracts with a confirmed renewal date; preview shows the next date.
- [ ] **7.2** Contract renewal on 29.02.2028, yearly → done → next item 28.02.2029.
- [ ] ⚠️ **7.3** „Unterlagen ausstehend“ dated yesterday → generators (`pvsql -c "select app_private.run_task_generators();"`)
  → one high-priority „Service: …“ task, no checkbox (system task); one notification.
- [ ] **7.4** Erledigt / Absagen are one click without note (P5-UX-07); the form's note field is missing.
- [ ] **7.5** Follow-up and service task are separate („Kunde nachfassen“ vs „Service: …“).

## 8. Privacy (compliance with 2FA)

- [ ] **8.1** Without 2FA → MFA notice, buttons disabled.
- [ ] **8.2** Auskunft for `K-…` → row „DS-n · Auskunft · Kunde · öffnen“ (no K-number shown, P5-UX-02), Frist
  = received + 1 month; **Daten exportieren** → JSON download, request closed, export log entry (raw codes,
  P5-UI-02). Closing an access request by hand isn't offered.
- [ ] **8.3** Löschung → **Pseudonymisieren** only after typing `LÖSCHEN` → customer „Gelöscht
  (pseudonymisiert)“, contracts kept, tasks and notifications without the name, lead pseudonymised too.
- [ ] **8.4** Berichtigung / Widerspruch → **Abschließen** with outcome; **Ablehnen** with reason.
- [ ] **8.5** More than 20 exports in an hour → „rate_limited“ message; the request stays open.
- [ ] **8.6** Consent overview numbers; retention OD-16 notice.

## 9. UI/UX checklist
Light and dark, 1,440 / 768 / 360 px, keyboard only, loading/empty/error states (block `*customers*`,
`*customer_consents*`, `*contract_links*` in DevTools), German copy without raw codes, toasts after every
save, kit buttons instead of text buttons, consent table readable on phones.

## 10. Performance
```bash
pvsql -c "select set_config('app.reason','Volumentest',false); insert into customers (last_name, owner_id, phone)
  select 'Volumen ' || g, (select id from employees where employee_no='E2E-FA-A'), '+49172' || lpad(g::text, 7, '0')
  from generate_series(1, 2500) g;"
```
- [ ] Customer list as Ali: how many rows arrive (Network)? Today 1,000 of 2,508 — PostgREST caps responses at
  1,000, the list asks for 2,000 and doesn't say anything (P5-PERF-01). Search for a name after the 1,000th.
- [ ] Detail page with 50 contracts / service items / consents: render time.
- [ ] Remove: `pvsql -c "select set_config('app.reason','x',false); delete from customers where last_name like 'Volumen %';"`

## 11. Review findings
See [r1-p5-verification.md](r1-p5-verification.md).
