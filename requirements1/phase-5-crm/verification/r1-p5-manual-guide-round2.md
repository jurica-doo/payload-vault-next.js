# Phase 5 — Test round 2 (after the review fixes)

Round 1 ([r1-p5-manual-guide.md](r1-p5-manual-guide.md)) found 17 issues; all are fixed (see
[r1-p5-verification.md](r1-p5-verification.md)). **Part A** confirms each fix in the app, **Part B** hunts for
what round 1 didn't cover. New findings go into `r1-p5-verification.md` → "Round 2" as **P5-R2-01, -02, …**

## 0. Setup
```bash
npm run e2e:prepare          # WIPES the local DB; the fill now also enrols 2FA for compliance@test.com
npm run dev
npm run totp -- compliance@test.com
alias pvsql='docker exec -i supabase_db_payload-vault psql -U postgres'
```
Automated first (all green before clicking):
```bash
npm run typecheck && npm run lint && npm test && npm run check:golden
npm run test:db                                      # 29 files, incl. 280_phase5_review_fixes
npx playwright test e2e/tests/phase5-crm.spec.ts     # 8 tests, one per fixed finding
```

---

## Part A — Re-check every fix

### Customers
- [ ] **P5-PERF-01 / P5-UI-01** With 2,500 extra customers (round 1 §10): notice „Es werden 1.000 von N Kunden
  angezeigt“; search finds customers outside the first 1,000; `0171 …`, `K-…`, e-mail, postcode all work.
- [ ] **P5-UX-09** Tabs show counts that follow the search; a miss says „Keine Kunden passen zur Suche“.
- [ ] **P5-REG-01 / P5-UX-05** Nächstes Nachfassen: time picker; date picker starts today; a past date via API →
  „Das Datum liegt in der Vergangenheit“; „Erledigt / entfernen“ clears it with a toast.
- [ ] **P5-UI-02** Profil: phone „+49 171 …“, Quelle „Vertragsportal · Nr. …“ or „aus Lead“ / „manuell angelegt“.
- [ ] **P5-UX-03** Admin without 2FA on a customer outside their structure: MFA notice, no forms; with 2FA all
  actions work.
- [ ] **P5-UX-04** Toasts after: create, edit, archive/reactivate, reassign (names the new adviser), follow-up,
  consent, objection, contract link/edit/remove, portal number, service item create/done/cancel, privacy
  actions. Reason fields show „n Zeichen, mindestens 10“.

### Consents
- [ ] **P5-UX-01** „Widerspruch: keine Kontaktaufnahme…“ opens a dialog (source + note); Abbrechen saves nothing;
  confirming blocks every purpose; „Widerspruch aufheben…“ also asks.
- [ ] **P5-PRIV-01** Compliance (2FA) on a customer: only „Widerruf erfassen“ and the objection; no grant, no
  lifting. Privacy page → Widerspruch request for a customer → **Widerspruch umsetzen** → request completed,
  customer blocked, consent history „Widerspruch · Brief – Datenschutzanfrage DS-n“. For a lead the request
  offers **Abschließen** with an outcome instead.
- [ ] **P5-API-01** API: unknown purpose, withdrawal with a basis → „Zweck, Art des Eintrags und Rechtsgrundlage
  passen nicht zusammen.“

### Contracts and service items
- [ ] **P5-UX-06** The link form has no „Quelle der Nummer“; API with `source_system: "portal"` → „Verträge werden
  von Hand immer als „aus Unterlagen“ verknüpft…“.
- [ ] **P5-UX-08** End before start → inline error under „Ende“; manual contracts have **Bearbeiten**; synced
  contracts have neither Bearbeiten nor Entfernen.
- [ ] **P5-UI-02** Contract title is the category name („Lebensversicherung“) when there's no product.
- [ ] **P5-UX-07** Erledigt / Absagen open a dialog with an optional note; a yearly item says the next one was
  created; the note shows in the history.
- [ ] **P5-API-02** Renewal without contract (API) → „keine bestätigte Hauptfälligkeit“.

### Privacy page
- [ ] **P5-UX-02** Open and closed requests show „Kunde K-…“ / „Lead L-…“; export log reads „Auskunft
  (Datenexport) · Kunde · DS-n · 6 Einträge“.
- [ ] **P5-UX-10** A new request for a pseudonymised customer: toast and row say „bereits pseudonymisiert“; no
  „Widerspruch umsetzen“ for it.

---

## Part B — New edge-case hunt
- [ ] **Concurrency**: two tabs reassign the same customer; adviser edits while compliance applies an objection;
  double-click on every save button → one record, one toast.
- [ ] **Sessions**: 2FA expires (log out/in) with the privacy page open → actions refuse with the MFA message,
  page doesn't break.
- [ ] **Lifecycle chains**: lead merged → converted → customer reassigned → erased: lead and customer both
  pseudonymised, contracts kept, activity notes gone, tasks closed, audit without the name.
- [ ] **Conversion edge cases**: lead with consent basis „Vertrag“ → which purposes are granted? Lead without
  phone/e-mail → consents „keine Adresse/Nummer“.
- [ ] **Deactivated adviser** with customers, open service items and follow-ups → who gets the tasks?
  (Customers stay with them until reassigned — 6.2 in the checklist.)
- [ ] **Sync**: same contract number manual + portal → two rows by design? Re-sync moves a contract to another
  customer; contract status „gekündigt“ via sync; 10,001 rows → refused; empty run.
- [ ] **Dates**: renewal 29.02 in a leap year → 28.02; service item yearly over New Year; follow-up at 23:59 on DST
  days.
- [ ] **Odd input**: names with emoji/RTL/`ß`, postal codes „D-80331“, „AT 1010“, very long notes (4,000 exactly),
  search with `%` `,` `(` `*`.
- [ ] **XSS**: `<img src=x onerror=alert(1)>` in names, notes, consent evidence, contract product, service
  title → rendered as text in list, detail, tasks, notifications, JSON export.
- [ ] **Export**: JSON contains activities from the lead time, consents, contracts, service items; nothing of other
  customers; rate limit after 20 exports per hour, request stays open and can be exported later.
- [ ] **Accessibility**: keyboard through ConsentCard, objection dialog, contract form, service dialogs, privacy
  page; labels for time inputs; focus returns after dialogs.
- [ ] **Layout**: 360 px (DevTools device mode) on customer list, customer detail (consent table!), privacy page;
  light and dark.
- [ ] **Volume**: 5,000 customers, 50 contracts and 50 service items on one customer, 500 privacy requests →
  list, detail and privacy page timings; no silent truncation (requests list is limited to 300, export log to 50 —
  check whether a notice is needed).
