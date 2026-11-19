# Phase 2 — Verification (spec ↔ docs ↔ code) and findings

| | |
|---|---|
| Date | 2026-11-19 |
| Branch | `feat/requirements1` |
| Scope | the five Phase 2 slices: rate-matrix, ledger, statements, subsidy, finance-ui — as they are **today**, i.e. with the later migrations (`20261031100000` view invoker, `20261031120000` `app_rpc`, `20261101140000` rules Stand 01.11.2026) and Profina's answers in `OD_ANSWERS_2026-11.md` |
| Method | Each slice note compared with the spec PDF (§2, §5.2–5.4, §6.1–6.4, §7.3, §11.2, §12.2–12.4, §13, §14.2–14.3, §16, §17.3–17.4) and with the final SQL and TypeScript. Every amount in §5.3 / §14.2 / §17.3 recalculated by hand against the ledger rows of the e2e data. Permission paths (RLS, RPC asserts, MFA) read line by line. Findings were confirmed in the live local database before being listed. |
| Automated | pgTAP 32 files (new: `310_phase2_3_review_fixes`, 32 assertions), Vitest 534 tests, Playwright `e2e/tests/phase2-commission.spec.ts` (12 tests, every one green on a fresh `npm run e2e`), `check:golden` 68 shared case IDs |
| Fixes | 2026-11-19: migration `20261101150000_phase2_3_review_fixes.sql` + UI; every finding marked ✅ below |

Manual test guide (click by click): [r1-p2-manual-guide.md](r1-p2-manual-guide.md).

## 0. What Phase 2 is, in plain words

Phase 2 turns confirmed production into **money**: who earns how much, when it is paid, and where
finance decides. Nothing here changes points or career progress; it only reads them.

| Part | What it is responsible for | Where in the app | Try this | You should see |
|---|---|---|---|---|
| **1. Rates** | Each career level has a rate per point (FA 28 € … VD 144 €). A producer earns points × own rate; every leader above earns the **difference** between their rate and the highest rate already paid below them (OD-05, provisional "rate compression"). 10 % reserve on every amount (versioned with the rules). | Verwaltung → **Regeln** (rates); the numbers appear on **Provisionen** | Confirm Fritz' Sach contract (93 P) | Fritz 2.604,00 €, Tina (TL) 3.906,00 €, Dora (DL) 3.906,00 € — total 112 € × 93 P, nobody paid twice |
| **2. Ledger** | Every booking is a row that can never be edited or deleted: producer, recipient, both levels **on the production date**, points, rate, gross, reserve, after reserve, month. A cancellation writes exact negative mirror rows. Anything that can't be calculated safely (person or leader without level) goes into a **queue** instead of guessing. | Vertrieb → **Provisionen** (own rows), Finanzen → Prüfwarteschlange | Cancel a confirmed contract; confirm a contract of someone without a level | Reversal rows net to 0; the queue lists the case with the person's name |
| **3. Months** | Bookings land in the first **open** month from today on. Finance takes a month offen → in Prüfung → freigegeben → ausgezahlt (with reasons, 2FA). Freigegeben and ausgezahlt are final: later corrections go to the next open month, so an approved statement never changes. | Vertrieb → Provisionen → **Abrechnung (Finanzen)** | Take a past month through all four states | Only the valid next steps are offered; "Freigeben" warns that the month becomes final |
| **4. Statement** | One person's month: Eigenproduktion / Differenz direkt / Differenz indirekt, each as Brutto / Reserve / Nach Reserve, plus the subsidy as a separate line. Never called "netto" or "Auszahlung". Each row explains itself. | Vertrieb → **Provisionen** | Click a booking | Production, levels, points, rate, gross → reserve → after reserve, with the OD-05 notice on differential rows |
| **5. Subsidy** | Finance records the **decided** monthly amount per person (not a payment, not automatic). The level maximum is a ceiling: above it, for FA (no standard maximum) and for part-time only with an exception reason. One approved record per person and month; changes supersede. Locked months refuse. | Abrechnung (Finanzen) → **Zuschuss** | 600 € for FB Ben | Refused until an exception reason is given; then shown on Ben's statement with "Höchstbetrag der Stufe: 500,00 €" |
| **6. Finance view** | Overview of every recipient per month (CSV, logged as an export), the subsidy form and the exception queue. Everything disabled without 2FA. | **/vertrieb/provisionen/abrechnung** | Open it without 2FA | Notice, every button and the CSV greyed out |

Who is who in the test data: `e2e/README.md` (all passwords `123456`, 2FA codes via `npm run totp -- <email>`).

## 1. Result

**The calculations are correct.** The rate-compression rule reproduces every worked example in the spec
(§5.3 chain 280 / 140 / 420, §14.2 560 / 56 / 504 and 280 / 28 / 252), the ledger stores exactly what
§5.4 asks for, reversals mirror the originals, nothing is paid twice, and approved months are immutable
(§14.3). Permissions are enforced in the database: own commission only, finance/admin everywhere,
leaders nothing beyond their own rows unless OD-17 is switched on; every finance write needs 2FA and a
reason and is audited.

**What was wrong or missing** (all fixed, section 3): the all-recipient CSV export did not need 2FA
although the spec asks to "protect exports/downloads"; finance could record a subsidy for a deactivated
employee; the "Subsidy review due" alert from §11.2 did not exist; the UI hard-coded "10 %" although the
reserve ratio is a versioned rule; the exception queue showed ids instead of names; the own statement
page fired a request that was refused for vault-only users.

**What is provisional or open** (section 3, "open"): the rate table per line and kind from Anlage 1
(E3) — for Sach the built 28 €/P ÷ 7,15 ÷ 28 = 13,99 % of the annual premium instead of Anlage 1's 10 %;
reserve release and clawback (OD-10, E3); level at "Verarbeitung" instead of production date (OD-12);
own contracts excluded (Ziff. 4); payment export to payroll (§16); OD-17.

## 2. Spec vs. slice docs vs. code

| Spec | Requirement | Status |
|---|---|---|
| §5.2 | rates FA 28 … VD 144 per point | ✅ seeded in both rules versions; VD+/GM provisionally at 144 (Q8) |
| §5.3 | DL → TL → FB → FA, 10 P: FB 280, TL 140, DL 420 | ✅ `commission_split` (SQL) = `splitCommission` (TS), golden GC-COMM-003; e2e proves it on the real data (Fritz 93 P: 2.604 / 3.906 / 3.906) |
| §5.3 note | "do not assume the DL receives a differential equal to DL − FA" | ✅ compression pays each ancestor own rate − highest rate already paid (OD-05, still provisional for TL…GM per Anlage 1, Q1) |
| §5.4 | one ledger entry per producer × record × recipient × rule; producer/recipient levels; direct/indirect; gross/reserve/net; period; status; no duplicate payment; drill-down; corrections as new entries | ✅ `commission_ledger` (unique per calculation × recipient × type, CHECK gross = reserve + net, append-only even for `postgres`); status = the month's status; drill-down = the row dialog. ⚠️ "status" per entry (calculated / disputed / adjusted) is not modelled — the month carries it |
| §6.1 | 10 % reserve on personal **and** differential commission | ✅ per entry, rounded 2 dp half-up, own component (never hidden in the rate) |
| §6.2 | gross / reserve / after reserve shown separately; reserve a separate component; releases/clawbacks recordable; statuses | ✅ shown separately everywhere. ⚠️ releases, adjustments, clawbacks: **not built** (OD-10 answered: reserve ≥ 10 %, 5-year liability, release when liability volume < reserve) → E3 |
| §6.3 | own production vs direct vs indirect; subsidy separate; never "take-home" | ✅ three buckets + subsidy line; unit test forbids "netto"/"Auszahlung" wording |
| §6.4 | ceiling, not a payment; individual amounts; auditable coverage decision | ✅ `subsidy_records` with ceiling snapshot, coverage note, override reason, audit; prorating/pausing not automated (OD-09 → E4) |
| §2 | FA: no standard maximum; maxima are for full-time | ✅ override required for FA and part-time |
| §7.3 | leader sees differential commission; higher leader sees subsidy overview | ✅ own differential; ⚠️ team commission and subsidies of the team only with OD-17 on (default off: remuneration is a business secret, Ziff. 12) |
| §11.2 | "Subsidy review due" alert; "Calculation exception → admin review queue" | ✅ queue existed; **review alert was missing → built (P2-TASK-01)** |
| §12.2 | restrict commission/subsidy amounts; stronger auth for admins; protect exports | ✅ RLS; finance writes need 2FA; **all-recipient export now needs 2FA (P2-EXPORT-01)**; reads still without 2FA (S6, decision) |
| §12.3 | audit old/new/reason for commission rate, reserve, subsidy | ✅ rules versions, statement status, subsidy records, exception queue audited; ledger rows are themselves the history |
| §12.4 | record exports | ✅ `rpc_log_export` before every CSV (kind, month, row count) |
| §13.1 | CommissionLedger / SubsidyRecord fields | ✅ all fields present; `rate_basis` = `rate_per_point` + `rule_version_id` |
| §14.2 | FB 10 P → 560 / 56 / 504; differential 280 / 28 / 252; statement separates personal and differential | ✅ pgTAP 100, e2e |
| §14.3 | hierarchy roll-up by effective-dated relationships; changing a manager doesn't rewrite approved statements; drill-down | ✅ chain resolved on the production date (pgTAP 090 transfer case); approved months immutable; drill-down per row |
| §16 | commission payment workflow: approval, export/payment reconciliation, finance permissions | ◐ approval workflow ✅; payment export / reconciliation ✗ (open) |
| §17.4 | adjacent differentials 28 / 14 / 22 / 42 / 40 / 12 | ✅ follow from the rates; TS property test: a full chain pays exactly the top rate |
| OD_ANSWERS A1 | rates per line and kind (‰ of Beitragssumme, % of premium, recurring kinds) | ✗ not built (E3). LV and KV give identical amounts with 28/56 €/P; **Sach differs** (13,99 % vs 10 %); recurring/Bestand kinds don't exist |
| OD_ANSWERS Ziff. 4 | own contracts earn no commission | ✗ not modelled (production has no "own contract" flag) → E3, Q5 |
| OD_ANSWERS Ziff. 6 / A1 Nr. 1 | level at processing; new rates from the month after a promotion | ✗ built: level on the production date → E3, Q4 |

Doc statements that are **no longer true** of the code (docs updated where it mattered):
- ledger doc: "`v_commission_ledger` is deliberately NOT `security_invoker`" — since `20261031100000` the view is invoker and the four looked-up fields come from `app_private.commission_ledger_facts` (same visibility rule). The pgTAP test "view leaks nothing" still guards it.
- finance-ui doc: "The CSV export of the overview … audited" — true, but it did not require 2FA (fixed).
- rate-matrix doc: "Kfz 0 points → nothing booked" — since Stand 01.11.2026 Kfz creates AE/points but `pays_commission = false`; the gate is `app_private.book_commission` → `book_commission_entries`. Behaviour for commission is the same (nothing booked).

## 3. Findings

Severity: high (wrong data / access / blocked flow), medium (misleading or silently wrong), low (polish).
`e2e` = regression test in `e2e/tests/phase2-commission.spec.ts` (title contains the ID); `pgTAP` = `310_phase2_3_review_fixes.test.sql`.

| ID | Sev. | Area | Finding | Evidence | Status |
|---|---|---|---|---|---|
| **P2-EXPORT-01** | medium | finance | The overview CSV (every recipient's gross / reserve / subsidy) could be built and logged by finance **without 2FA**; only writes were gated. Spec §12.2: "require stronger authentication … protect exports/downloads". | `rpc_log_export` checked the role only | ✅ fixed — `rpc_log_export` runs `assert_finance_or_admin()` (2FA) for `statement_overview` and `ledger`; the own `statement` export stays open; the CSV button is disabled without 2FA. pgTAP, e2e, vitest |
| **P2-SUBSIDY-01** | medium | subsidy | Finance could record a subsidy for a **deactivated** employee (the picker filters, the RPC didn't); override reason and coverage note were unbounded or failed with a bare CHECK error. | `rpc_set_subsidy` | ✅ fixed — `owner_inactive`, `reason_too_long` (> 500), `text_too_long` (> 1.000), `invalid_input` for negative amounts (was 23514). pgTAP, e2e |
| **P2-TASK-01** | medium | alerts | §11.2 "Subsidy review due → notify authorised manager/admin" did not exist: a subsidy decided last month silently had no follow-up this month. | task type `subsidy_review` existed only in the CHECK list | ✅ built — `app_private.run_subsidy_review_tasks()` (part of `run_task_generators`): for every active employee with an approved subsidy > 0 last month and no decision this month, one system task per active finance user ("Zuschuss prüfen: Name (MM.YYYY, Vormonat x €)", due on the 10th, link to Abrechnung). Closes itself once a record exists (also 0 €) or the month is locked; stale tasks of earlier months are cancelled. pgTAP, e2e |
| **P2-UI-01** | medium | statement | "Reserve (10 %)" and "Reserve = 10 % von Brutto" were hard-coded, although `rule_versions.reserve_ratio` is versioned (Ziff. 5: "≥ 10 %, Profina may set more"). A future 12 % version would be mislabelled. | `CommissionPage.tsx` | ✅ fixed — label and formula use the booked ratio (reserve ÷ gross per statement / per entry). vitest |
| **P2-UI-02** | low | statement | Vault-only users triggered `rpc_statement` → `forbidden` before the "nur für aktive Mitarbeitende" explanation was shown (a refused request per visit). | `useStatement` without `enabled` | ✅ fixed — query only with an employee id |
| **P2-UI-03** | low | finance | The exception queue showed the reason and the production date but not **whose** production, and not which ancestor lacks a level. | `FinancePage.tsx` showed `details.production_date` only | ✅ fixed — producer name, date, and "ohne Stufe: …" for `ancestor_without_level` (names from the employee list finance already loads) |
| P2-OPEN-01 | — | rules | Commission per line and kind (Anlage 1: ‰ of Beitragssumme for LV, % of premium for Sach/KV/Kfz/RS, recurring and Bestand kinds). Built: € per point. **Sach pays 13,99 % instead of 10 %** for FA/FB; LV and KV match exactly. | `OD_ANSWERS` §2 cross-check | open → **E3**; the OD-05 notice stays on every differential row |
| P2-OPEN-02 | — | reserve | Reserve release / clawback rows, 5-year liability, partial release (Ziff. 4, 5). | OD-10 | open → E3 |
| P2-OPEN-03 | — | attribution | Level **at processing** and new rates from the month after a promotion (A1 Nr. 1, Ziff. 6) vs. built: level on the production date. | OD-12 | open → E3 (Q4) |
| P2-OPEN-04 | — | production | Own contracts (agent = policyholder/insured) earn no commission (Ziff. 4); no flag exists. | — | open → E3 (Q5) |
| P2-OPEN-05 | — | finance | Payment export to payroll and reconciliation (§16). | — | open (CHECKLIST 6.2) |
| P2-OPEN-06 | — | leaders | Team statements for leaders (OD-17): RPCs accept an employee id when the setting is on, no page exists. | `app_settings.commission` | open (decision) |
| P2-NOTE-01 | low | months | "In Prüfung" is not a lock: bookings skip it (they go to the next open month), but subsidies can still be recorded in a reviewed month. Consistent with the docs; finance should know it. | `assert_month_open` locks approved/paid only | documented in the guide |
| P2-NOTE-02 | low | performance | `v_commission_ledger` calls `commission_ledger_facts(id)` per row (SECURITY DEFINER, re-checks visibility) on top of the RLS check per row. Fine for a person's month; a finance export of thousands of rows should use `rpc_statement_overview` (it does). Watch on staging with volume. | `20261031100000` | noted |

Checked and **correct** (no finding): rounding per entry (gross 2 dp half-up, reserve = round(gross × ratio), net = gross − reserve, CHECK enforces the sum); 0-point and `pays_commission = false` lines book nothing and raise no exception; reversal of a never-booked calculation dismisses its open exception; correction = reversal + new original with the **new** production date; `rpc_retry_commission` refuses `already_booked` / `already_reversed` / `still_not_bookable`; the booking month is the first open month from today (never a past month); `month_not_ended` blocks approving the running month; paid is final; every status change audited with the reason; the ledger, versions and reviews are append-only even for `postgres`; employees see no queue; peers see nothing; a leader keeps their own rows after the producer left (and nothing more); finance sees everyone; direct table writes are refused.

## 4. Manual test plan

[r1-p2-manual-guide.md](r1-p2-manual-guide.md) — 8 sections in order, section 7 re-checks the fixed findings, section 8 is the UI/UX checklist (light + dark, 360 px).

## 5. Automated coverage

| File | Tests |
|---|---|
| `supabase/tests/080_commission_rules.test.sql` | golden cases GC-COMM-001…011 in SQL (rate compression, rounding, 0 P, reversal, ancestor without level) |
| `supabase/tests/090_commission_ledger.test.sql` | §5.3 chain, no double booking, exact reversal, Kfz, producer/ancestor without level + retry, locked month → next month, transfer on the production date, RLS incl. OD-17, append-only |
| `supabase/tests/100_statements.test.sql` | §14.2 buckets, DL direct/indirect, visibility, overview, workflow incl. `month_not_ended` and final states, audit, MFA, export log |
| `supabase/tests/110_subsidy.test.sql` | ceiling snapshot, override cases (above max, FA, part-time), 0, before start, negative, locked month, statement/overview lines, revoke, RLS, audit |
| `supabase/tests/310_phase2_3_review_fixes.test.sql` | **P2-EXPORT-01**, **P2-SUBSIDY-01**, **P2-TASK-01** (+ Phase 3) |
| `src/domain/commission.test.ts`, `scripts/check-golden-parity` | TS mirror = SQL on 68 shared IDs |
| `src/views/commission/*.test.tsx` | statement layout, no take-home wording, finance next steps, MFA gating incl. CSV, reserve label from data |
| `e2e/tests/phase2-commission.spec.ts` | ledger rows of Fritz' Sach contract (2.604 / 3.906 / 3.906, total 112 × 93), Kfz no commission, cancelled KV nets to 0; statement page + row dialog; Tina direct / Dora indirect; OD-17 refusals; finance without 2FA; month workflow with audit reasons; invalid transition; subsidy 600 € refused/accepted + Ben's statement; **P2-SUBSIDY-01**; **P2-TASK-01** |

Not automated: a cancellation **after** approval landing in the next open month in the browser (pgTAP 090 covers it; the running month can't be approved), the CSV file contents beyond the unit test, OD-17 switched on in the browser.

## 6. Decisions for Profina (Gate A / C) touched by Phase 2
OD-05 complete rate matrix per line, kind and level (Q1) · OD-10 release/clawback mechanics (Q6) · OD-12 "Verarbeitung" date (Q4) · own contracts and AE (Q5) · OD-17 team commission visibility · OD-09 subsidy expectation per agreement (E4) · S6 whether finance **reads** should also need 2FA · Gate C: ≥ 10 real statements reconciled against Profina's manual calculation before anyone sees commission in production.
