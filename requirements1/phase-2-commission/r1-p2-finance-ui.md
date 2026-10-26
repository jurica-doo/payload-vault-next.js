# r1/p2/finance-ui — Commission statement and finance workspace

| | |
|---|---|
| Branch | `r1/p2/finance-ui` → merged into `r1/p2-commission` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 2 · `r1/p2/finance-ui`; spec §6.2, §6.3, §11.2, §12.4 |
| Status | Done; 12 new unit tests (269 total), build OK |
| Date | 2026-10-26 |

## What was done
| Path | What |
|---|---|
| `/vertrieb/provisionen` | Own statement per month (month picker): **KPI tiles** "Provision brutto", "Reserve (10 %)", "Nach Reserve" ("vor sonstigen Abzügen") and "Zuschuss (genehmigt)" with the level ceiling as a hint. A table with **Eigenproduktion / Differenz direkt / Differenz indirekt** and a total. Every booking is listed (reversals marked). A row opens "Provisionsbuchung": production, **levels on the production date**, points, rate, gross → reserve → after reserve, with the OD-05 notice on differential entries. The month status badge is shown. **CSV** of the bookings is logged as an export first. An OD-05/OD-10 notice sits at the bottom. Vault-only users get an explanation instead of an error. |
| `/vertrieb/provisionen/abrechnung` | **Finance/admin only** (lives under the commission module so finance users without the admin role can reach it). Month picker, status badge, and **only the valid next steps** (Zur Prüfung → Freigeben / Wieder öffnen → Als ausgezahlt markieren), each with a reason; approval warns that the month becomes final. Overview table (bookings, gross, reserve, after reserve, subsidy) with an **audited CSV export**. Subsidy form (person, amount, coverage basis, reason, optional exception reason, with a hint that the maximum is a ceiling, not a promise). **Exception queue** with "Erneut buchen" and "Verwerfen" (reason). Everything is disabled without MFA, with the notice. |
| `src/hooks/useCommission/useCommission.ts` | `useStatement`, `useLedgerEntries`, `useFinance` (overview, period, exceptions, mutations), `logExport`. |
| `src/views/commission/statementCsv.ts` | Semicolon CSV with German decimals. Text cells go through the formula-injection guard; **our own numbers are written raw**, because the guard would turn negative reversals like `-280` into text. |
| `src/utils/dbErrors.ts` | German messages for all commission keys. |

## How to verify
```bash
npx vitest run src/views/commission
```
On staging:
1. As FB with one own KV contract and one FA contract confirmed: `/vertrieb/provisionen` shows 560/56/504 in Eigenproduktion and 280/28/252 in Differenz direkt.
2. As finance with MFA: on `/vertrieb/provisionen/abrechnung`, take last month through Zur Prüfung → Freigeben → Ausgezahlt.
3. Enter a subsidy of 600 for an FB: refused until an exception reason is given.
4. Confirm a contract for someone without a level: it appears in the queue; set the level, then "Erneut buchen".

## What to look out for
- **Not clicked through signed in** (no staging). Covered by unit tests with mocked hooks, plus the DB tests of the previous slices.
- The finance subsidy picker lists **all active employees** (finance sees everyone). There's no search by structure yet.
- The month picker uses the browser's native `type="month"` input; Safari on older macOS shows a text field. Acceptable for an internal tool; replace with `PeriodSelector` if needed.
- Leaders don't get a team statement page; OD-17 is off by default. If Profina allows it, the RPCs already accept an employee id (with the setting on), and the page needs an `EmployeePicker` like the career page.
- Payment export to payroll and reserve release/clawback (OD-10) are not built.

## Edge cases covered by tests
- statement: brutto 840, reserve 84, after reserve 756, subsidy 400 in separate tiles; Eigenproduktion row 560/504
- no "netto"/"Auszahlung" wording anywhere
- finance link hidden for non-finance; vault-only users get an explanation
- finance: only valid next steps for "reviewed"; none except CSV for "paid"; all writes disabled without MFA; non-finance users are shut out
- CSV: German decimals, negative reversals stay numeric, text cells formula-guarded
