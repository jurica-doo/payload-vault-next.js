# Phase 1 — Verification (spec ↔ docs ↔ code) and manual test plan

| | |
|---|---|
| Date | 2026-10-31 |
| Branch | `feat/requirements1` |
| Scope | the six Phase 1 slices: audit, identity-roles, hierarchy, rules-config, production, career-engine |
| Method | Each slice doc compared with the spec PDF (§2–§5, §7.1, §12–§17) and with the **final** code (later migrations included; live DB definitions checked). Every golden case recalculated independently with exact decimals. Findings below were confirmed in code or the live DB before being listed. |
| Automated | `npm run e2e` (DB reset + fill + 53 Playwright tests, `e2e/`), pgTAP 27 files / 789 assertions, Vitest 408 tests |
| Fixes | 2026-10-31: the confirmed defects in section 3 marked ✅ were fixed (7 migrations `20261031130000`…`20261031190000` + UI) |

## 0. What Phase 1 is, in plain words

Phase 1 is the **foundation of the sales system ("Vertrieb")**: who works here, who reports to whom,
what the career rules are, what each person sold, and how close they are to their next career level.
Everything later (commission, dashboards, leads, customers) is built on these six parts.

| Part | What it is responsible for | Where in the app | Try this | You should see |
|---|---|---|---|---|
| **1. Employees & roles** | Only invited people get an account; an admin creates employees, gives roles (Administration, Finanzen, Datenschutz/Compliance), deactivates people. Admin changes need a 2FA-confirmed login. | Verwaltung → **Mitarbeitende**; Profil → **Sicherheit & Zwei-Faktor** | As admin, open Mitarbeitende before and after entering the 2FA code; create "Nina Neu"; deactivate Max | Without 2FA everything is greyed out; with 2FA it works; Nina appears as "Eingeladen"; Max loses the Vertrieb menu and every role right (roles rest until reactivation) but keeps his Tresor |
| **2. Audit trail** | Every change to sensitive data is recorded: who, when, old → new value, and the reason. Nobody can edit or delete it. | "Verlauf" in a production record's details (and the DB) | Open a production record → Verlauf | Each step with person, time and reason |
| **3. Hierarchy** | Who reports to whom, **with dates** (also planned future moves). Leaders see their whole structure, nobody sees more. No circles. | Vertrieb → **Team**; Verwaltung → **Hierarchie** | Log in as Tim, then as Dora; in Hierarchie try to put Dora under Ali | Tim sees Anna, Ali, Ben only; Dora sees everyone below her (tree fully expanded); the circle and back-dated changes are refused; cancelled moves stay in the history |
| **4. Rules** | The official rule book from the spec: 7 career levels (FA … VD) with rate per point, subsidy, points threshold, and how premiums convert into points. Versioned — changes only via a draft that becomes valid in the future. Also each person's career level. | Verwaltung → **Regeln**; Mitarbeitende → "Stufe ändern" | Compare the table with spec §2; make a draft with falling rates and publish it | Values equal the spec; the bad draft is refused with a clear message |
| **5. Production & points** | Advisers enter sold contracts. The system turns the premium into **points (P)** and **AE** (LV: monthly × 12 × years ÷ 4000; KV: monthly ÷ 28; Sach: yearly net ÷ 200; Kfz/Strom/Gas: 0). Points only count once finance confirms the contract ("Anrechenbar"). Cancelling or correcting keeps a full history. Admins can import contracts from CSV. | Vertrieb → **Produktion** (+ "CSV-Import") | As Paula: look at her list and open a record; enter LV 100 € × 35 years in the form; as finance: confirm her Strom contract | 10,50 P for the LV, 25 P for KV 700 €, 5 P for Sach 1.000 €, 0 for Kfz; the record explains its formula; a cancelled one shows a reversal |
| **6. Career** | Within the career year: are your confirmed points ≥ the next level's threshold, and are at least 10 % of them health insurance (KV)? From OL upward one team may count at most 50 %. When someone qualifies, an admin approves the promotion. | Vertrieb → **Karriere**; Verwaltung → **Beförderungen** | Log in as Fritz, Tim, Ben; as admin open Beförderungen and approve one | Fritz 100/100 P but only 7/10 KV → "In Arbeit"; Tim 775/750 with Anna's 800 capped at 375 → "Qualifiziert"; the queue lists Anna, Ben, Tim |

Who is who in the test data: `e2e/README.md` (all passwords `123456`, 2FA codes via `npm run totp -- <email>`).
The click-by-click guide for these six parts is [r1-p1-manual-guide.md](r1-p1-manual-guide.md).

## 1. Result

**The calculations are correct.** Every seeded rule value matches the spec (§2 rates, subsidies and
thresholds; §3 conversion; §4.4 KV minimum; 1 P = 28 AE; 50 % cap from target OL). All 17 points cases,
7 qualification cases and 5 period cases agree in the spec, the docs, the SQL engine and the TS engine.
Permissions are enforced in the database (RLS + RPCs with admin/MFA/reason checks), and direct writes
are refused.

**Update 2026-10-31:** the three high-severity defects (S1, H1, K1), the CI time bomb (T1) and the
medium findings S3, S4, S5, S7, R1, P1, P2, P3 and P5 are fixed (section 3). Still open: the low-severity
items S6, R2, K2, P4 (decisions rather than bugs), and the *provisional* interpretations (OD-01…OD-08,
OD-15) that need Profina's decision (Gate A).

## 2. Spec vs. slice docs

| Spec | Requirement | Status |
|---|---|---|
| §2 | 7 levels FA…VD, rates, max subsidy, thresholds | ✅ exact |
| §3.1–3.5 | LV `monthly × 12 × term ÷ 4000` (max 35 y), KV `÷ 28` (explicit KV tag), Sach `annual net ÷ 200`, Kfz/Strom/Gas 0, AE = P × 28 | ✅ exact. LV/Sach in a different payment rhythm are refused (`premium_period_mismatch`) — an interpretation, not flagged as an OD |
| §4.1–4.2 | personal first year, transition to calendar years | ✅ (OD-01 provisional: 29 Feb → 1 Mar, `[start, end)`) |
| §4.3 | "reset only the points counted for the next promotion cycle **at the end of the career period**" | ⚠️ the code also restarts counting **at every promotion** (OD-02, provisional) — from the day after the promotion (K1 fixed) |
| §4.4 | KV ≥ 10 % of the threshold for every target level | ✅ |
| §4.5 | one structure counts at most 50 % of the threshold (from TL onward, i.e. target OL+) | ✅ (OD-03/OD-04: "structure" = a direct report's subtree; KV kept proportionally) |
| §5.1 / §14.3 | permanent, effective-dated hierarchy; transfers don't rewrite history | ✅ changes take effect today or later (H1 fixed); cancelled planned moves stay visible from the audit log |
| §7.1 | employee name, unique id, start date, status, contact | ✅ in the DB; ⚠️ the UI can't edit name/phone/start date (`rpc_update_employee` unused) |
| §12.1 | adviser / leader / admin / finance / compliance | ✅ (leader derived from the hierarchy). ⚠️ finance sees *all* employees ("assigned scope" not modelled; noted, not an OD) |
| §12.2 | separate permissions, stronger auth for admins, soft delete | ⚠️ MFA only for admin/finance **writes**; reads need no MFA; no four-eyes rule (an admin can confirm their own production and approve their own promotion) |
| §12.3 | audit: actor, time, old/new, reason, related record | ✅ append-only (UPDATE/DELETE refused even for `postgres`); ⚠️ no audit view in the UI except on production details |
| §12.4 | session handling on deactivation | ⚠️ roles rest while deactivated (S1 fixed, effective on the next request); the session itself isn't ended (documented follow-up) |
| §13 | data model | ✅ with deliberate deviations: no stored career credits / qualification snapshots (computed on demand; promotion evidence frozen) |
| §14.1 / §14.4 / §17 | worked examples | ✅ reproduced by the fill data and the e2e suite |
| §16 | open questions | ✅ mostly mapped to OD-01…OD-19; ❌ "hierarchy changes / exceptions" has no OD entry although the hierarchy doc refers to one |

Doc statements that were **not true** of the code:
- hierarchy doc: "Back-dating is refused" — only dates before the *start* of the current assignment were refused (H1). ✅ true now.
- identity doc: "Default privileges revoke EXECUTE on future `app_private` functions" — was ineffective (S5). ✅ true now.
- identity doc: "an expired link plus a valid row is fixed by 'Einladung senden' again" — was impossible once the first mail went out (S4). ✅ true now ("Erneut einladen").
- career doc: "the page restarts at 0 towards the next level" — was not true for production dated on the approval day (K1). ✅ true now.
- rules doc: `rpc_create_rule_draft` "copies the version in force" — it copies the latest *published* version (may be a future one). Open (doc wording).
- production doc: "Formula prefixes are stripped from text cells" — only Quelle-ID and Referenz. Open (doc wording).

## 3. Findings (confirmed)

`e2e` = covered by a regression test in the suite (title starts with the ID). Until the fix these were
expected-failure tests (`test.fail`); now they are ordinary tests.

| ID | Sev. | Area | Finding | Evidence | e2e | Status |
|---|---|---|---|---|---|---|
| **S1** | high | roles | **Deactivating an employee keeps their roles.** `app_private.has_role()` ignores the employee status, so a deactivated admin/finance/compliance user keeps full rights (reads; admin writes with their 2FA). The dialog says "verliert sofort den Zugriff". | `has_role` body; `rpc_set_employee_active` only changes status | C1 | ✅ fixed — `has_role()` ignores the roles of deactivated employees; `rpc_my_context` lists only effective roles; the last-admin guard counts only effective admins. Role rows stay (reactivation restores them). `20261031140000` |
| **H1** | high | hierarchy | **Back-dated transfers are accepted** when the date is on/after the current assignment's start. Same date → the existing row is rewritten in place; a past date → split in the past. Career credits for past production silently move; the form hint says the system refuses this. | `rpc_assign_manager` | H1 | ✅ fixed — once someone has a manager, a change must take effect today or later (`retroactive_change`); a person's first assignment may still start in the past. `20261031150000` |
| **K1** | high | career | **Production dated on the promotion day counts twice.** The approval counts production up to and including today; the new level starts today and its window `[today, …)` counts the same contracts again. | `compute_qualification` window, `rpc_approve_promotion` | K1 | ✅ fixed — after a promotion the new window starts the day after; the promotion day belongs to the old level. Levels can't be entered for the future (`level_in_future`). `20261031160000` |
| **T1** | high (CI) | tests | **pgTAP time bombs.** `050_rules_config` fails from **2026-12-01** (draft dated 2026-12-01 hits `effective_date_not_future` first); 050/070 from 2027-01-01 (fixed 2026 dates, first career year assumed); 040 from autumn 2027. | `050:114-119`, `070`, `040` | – | ✅ fixed — `app_private.business_today()` honours the setting `app.business_today`; `db-test.sh` pins it to 2026-10-31 (`PV_TEST_TODAY`), tests that need another day use `SET LOCAL`. Follow-up 2026-11-01: 160, 180 and 260 count rows stamped with `now()` in business-date windows and failed once the calendar passed the pin; they now use the real day (`SET LOCAL app.business_today = ''`), and 040's Berlin-time check clears the pin. Checked with the pin moved up to two months back (only fixed-date expectations fail then, as designed). `20261031130000` |
| **S3** | medium | identity | **Self-signup can claim an open invite** when the invite mail was not (successfully) sent: the gate only checks for an open invite. Locally `enable_signup = true`; production relies on the dashboard toggle (runbook step 3). Fix: also require `NEW.invited_at IS NOT NULL`. | `enforce_employee_invite`, config.toml | C3 | ✅ fixed — `[auth] enable_signup = false` locally (as in production; `[auth.email] enable_signup` stays `true`, it switches e-mail logins); invites use the admin API. `config.toml` |
| **S4** | medium | identity | **An invite can't be re-sent after the first mail.** GoTrue creates the auth user when sending, the link trigger sets `user_id`, and `rpc_issue_invite` then refuses `already_linked`. An expired link (1 h locally, 24 h hosted) leaves the person stuck. | `rpc_issue_invite` | – | ✅ fixed — an invite can be issued again while the account hasn't confirmed its e-mail; UI button "Erneut einladen". `20261031170000` |
| **P1** | medium | import | **Staging checks the points engine, not the table constraints.** E.g. Kfz with Rhythmus "quartalsweise" shows "OK", then the whole commit fails with a generic message. | `calculate_points` returns ok; CHECK `premium_period` | P1 | ✅ fixed — staging also checks Rhythmus, Netto/Brutto, Laufzeit and text lengths. `20261031180000` |
| **P2** | medium | import | **Duplicate protection depends on the free-text "Quellsystem"**: "E2E" vs "e2e" imports the same Quelle-ID again (points/commission twice once confirmed). | unique `(source_system, source_system_id)` | P2 | ✅ fixed — duplicate check and unique index ignore the case of the Quellsystem. `20261031180000` |
| **P3** | medium | import | Import result list and several lists are cut at **1,000 rows** (`max_rows = 1000`) while staging allows 5,000 — counts and "N gültige Zeilen" are wrong for big files. | config.toml, `useProduction` | – | ✅ fixed for the import preview (reads all rows page by page). Other lists that load everything (e.g. employees, levels) are far below 1,000 rows today. `useProduction` |
| **S5** | medium | DB | 73 SECURITY DEFINER functions in `app_private` are executable by `authenticated` via Postgres' PUBLIC default (not reachable through the API — defence in depth only). | `has_function_privilege` | – | ✅ fixed — PUBLIC loses EXECUTE on all `app_private` functions, also for future ones; pgTAP 000 guards it. `20261031190000` |
| S6 | low | auth | Admin/finance/compliance **reads** need no MFA; no four-eyes rule. | §12.2 | – | open — decision (§12.2) |
| S7 | low | identity | Revoking an invite after sending doesn't stop activation via the mail link. | `activate_on_confirm` | – | ✅ fixed — activation needs an open invite. `20261031170000` |
| R1 | medium | rules | Future-dated level entries are allowed; a later promotion can be overridden by an earlier-entered future correction (append-only, can't be withdrawn). | `rpc_set_employee_level` | – | ✅ fixed — see K1 (`level_in_future`) |
| R2 | low | rules | Reserve ratio (10 %) is neither shown nor editable on `/admin/regeln`, although the checklist says to check it there. | RulesAdminPage | – | open — UI addition |
| K2 | low | career | Thresholds come from the rules valid **today**, not at the period start (a mid-period rule change moves the target). No OD. | `compute_qualification` | – | open — decision (OD) |
| P4 | low | access | Finance/admin **without** an employee record can't open Produktion ("Anrechenbar", CSV import unreachable). The test data gives finance an employee record. | module audience | – | open — decision (module audience) |
| P5 | low | import | CSV dates like `06/05/2026` and numbers like `1,234.50` are misread silently. | csvImport | – | ✅ fixed — the DB accepts only ISO dates (the CSV mapper converts DD.MM.YYYY), and `parseGermanDecimal` refuses English formats like `1,234.50`. |
| U1 | low | hierarchy UI | Found in the manual test (3.1–3.5): the team tree opened with only the top level, and the expand toggles were tiny, so the whole structure wasn't visible. | `TeamPage`, `HierarchyTree` | DL Dora | ✅ fixed — opens fully expanded (up to 200 people), "Alle aufklappen" / "Alle zuklappen", larger chevron toggle |
| U2 | medium | hierarchy | Found in the manual test (3.10): a cancelled planned move vanished from the history, so nobody could trace it. | `rpc_cancel_future_assignment` deletes the row | cancelled move | ✅ fixed — the history shows it as "Abgesagt" with planned date, who, when and why (from the audit log, `rpc_cancelled_assignments`, admins only). `20261031150000` |

## 4. Manual test plan

Click-by-click guide with URLs, German labels (+ English meaning) and expected results:
**[r1-p1-manual-guide.md](r1-p1-manual-guide.md)** — sections 1–7 cover the six parts in order, section 8
re-checks the fixed findings.

## 5. Automated coverage (`npm run e2e` — resets and fills the local DB first)

| File | Tests |
|---|---|
| `phase1-1-identity.spec.ts` | sidebar per role (adviser, leader, admin, vault, inactive); MFA gate; data states; create employee (validation, normalisation, duplicate); last admin; API: `mfa_required`/`forbidden`, direct writes refused, RLS visibility, audit access, audit append-only; **C1** (deactivated admin has no roles, admin RPC `forbidden`), **C3** (signup disabled) |
| `phase1-2-hierarchy.spec.ts` | team tree for FB/TL/DL/FA (fully expanded, collapse/expand all); history Aktuell/Geplant; cycle, before start date, before a planned transfer; **H1** (`retroactive_change`); cancelled move stays in the history |
| `phase1-3-rules.spec.ts` | active tables = spec §2/§3; draft highlight, falling rates refused, discard; drafts invisible to non-admins |
| `phase1-4-production.spec.ts` | §14.1 values and statuses; details; correction ledger; live preview + OD-06; finance confirms; RLS; ledger append-only; CSV import incl. errors and re-import; **P1** (invalid rhythm reported at staging), **P2** (`already_imported` across spellings) |
| `phase1-5-career.spec.ts` | progress for 5 people (§14.4, §4.5, threshold boundary); capped structure; blocked state; visibility; promotion queue; §14.4 completion through the UI; approval (new window from tomorrow); **K1** (0 points after promotion) |

Not automated (yet): the invite mail round trip and re-invite (needs `functions-serve` + Mailpit API),
a 1,000+ row import (P3), the session-level effect of deactivation, period rollover at 1 January in the
browser (pgTAP covers it with `app.business_today`), and mobile layouts.

## 6. Decisions for Profina (Gate A) touched by Phase 1
OD-01 period boundaries · OD-02 restart after promotion (and the same-day rule, K1) · OD-03 KV share of a
capped structure · OD-04 what a structure is / cap from OL · OD-06 LV term over 35 years · OD-07
rounding · OD-08 when production becomes eligible · OD-15 promotion approval · **new:** hierarchy
corrections in the past (H1 — now refused; does Profina need a correction workflow?), the role matrix and finance scope
(§12.1/§12.2), and whether LV/Sach in other payment rhythms should be converted or refused.
