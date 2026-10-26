# r1/p1/production — Production records, points engine, CSV import

| | |
|---|---|
| Branch | `r1/p1/production` → merged into `r1/p1-foundation` |
| Plan section | IMPLEMENTATION_PLAN.md §3.2, §6 Phase 1 · `r1/p1/production`; spec §3, §13.2, §14.1, §17.1 |
| Status | Done; 56 new pgTAP assertions (253 total), 227 unit tests, **17 golden cases verified in both engines** |
| Date | 2026-10-26 |

## What was done

### Database — `20261026180000_production.sql`
| Object | Notes |
|---|---|
| `production_records` | Raw facts: producer, category, premium (> 0), period, net/gross, currency, LV term, production date, reference, notes, source (manual/import), `source_system` + `source_system_id` (**unique pair**, so duplicates are impossible). Lifecycle `draft → submitted → eligible → cancelled`. Audited. |
| `point_calculations` | **Append-only ledger** (trigger, also for `postgres`). `original` (+) when a record becomes eligible; `reversal` (exact negative mirror, linked via `reverses_id`, at most once per original) on cancellation or correction. Each row stores rule version, points, AE, KV points and `details` (inputs, formula, exact value, term used/capped, AE factor). A `seq` identity gives a guaranteed ledger order. |
| `app_private.calculate_points(…)` | **The single SQL implementation** of spec §3. It validates in a fixed order (rules for the date → premium > 0 → EUR → category → period → net/gross → LV term) and returns `{ok, points, ae, kv_points, rule_version_id, details}` or `{ok:false, error}`. It never raises, so imports can collect errors per row. |
| `app_private.validate_production(row)` | Adds producer checks: not before the start date, not after deactivation, not in the future. |
| `v_production` | `security_invoker` view with current totals (sum of ledger rows) and producer name. |
| RPCs | `rpc_save_production` (create/edit **drafts only**; producer themselves or admin + MFA), `rpc_submit_production`, `rpc_delete_production_draft`, `rpc_mark_production_eligible` (**admin or finance + MFA**, OD-08), `rpc_cancel_production(reason)` (eligible ones by admin/finance, which also writes the reversal), `rpc_correct_production(…, reason)` (admin/finance: reversal + new facts + new original), `rpc_preview_points` (authoritative preview, no write). |
| Import | `import_batches` / `import_rows` (admin only). `rpc_stage_production_import(source, file, rows)` validates every row and stores its own error list (`source_id_required`, `duplicate_in_file`, `already_imported`, `unknown_employee_no`, `invalid_value`, plus every engine key); max 5,000 rows. `rpc_commit_production_import(batch)` takes over **only valid rows**, as `submitted`, with one audit correlation id per batch; a batch commits once. |
| `can_read_audit` | Extended: production history is readable by whoever can see the producer. |

**Rounding (OD-07, provisional):** points are rounded **half-up to 4 decimals once**. AE = rounded points × AE factor (28), rounded to 4 decimals, so stored AE is always exactly points × 28.

### Golden cases (`GC-POINTS-001 … 017`)
The same 17 cases run in `supabase/tests/060_production.test.sql` and `src/domain/points.test.ts`; `npm run check:golden` reports **17 shared IDs**.

| ID | Case | Expected |
|---|---|---|
| 001 | LV 100 €/mtl., 35 J. (§14.1) | 10.5000 P · 294 AE |
| 002 | KV 700 €/mtl. (§14.1) | 25 P · 700 AE · 25 KV-P |
| 003 | Sach 1,000 € jährl. netto (§14.1) | 5 P · 140 AE |
| 004–006 | Kfz / Strom / Gas (§3.4) | 0 / 0 |
| 007 | LV 40 years | capped to 35 → 10.5 P, flagged |
| 008 | LV 85.37 × 12 × 23 ÷ 4000 = 5.89053 | 5.8905 P · 164.934 AE |
| 009 | KV 333.33 ÷ 28 = 11.904642… | 11.9046 P · 333.3288 AE (from rounded P) |
| 010 | Sach gross | `net_premium_required` |
| 011 | KV entered annually | `premium_period_mismatch` |
| 012 | LV without term | `term_required` |
| 013 | USD | `currency_not_supported` |
| 014 | date 2025-12-31 | `no_rules_for_date` |
| 015 | Sach 0.01 € → 0.00005 | **half-up** to 0.0001 P |
| 016 | LV 10.5 years | 3.15 P |
| 017 | premium 0 | `premium_must_be_positive` |

The expected values were also re-derived independently with Python's `Decimal`.

### Frontend
| Path | What |
|---|---|
| `/vertrieb/produktion` | Paginated list (own + structure via RLS; producer column for leaders/admin/finance), status badges, points and AE. Row click opens the details: "Woher kommt diese Zahl?" from the **stored** calculation (inputs, formula, exact and rounded value, AE factor), the ledger (calculation / reversal with reason), and the audit timeline. Actions by role: draft → submit/delete (owner or admin); submitted → "Anrechenbar" (admin/finance + MFA); cancel (owner while submitted, admin/finance once eligible, with a reason). |
| Entry form | Category-dependent fields (LV term, Sach net/gross; rhythm locked where the rule demands it). **Live preview** with the TS mirror and the rules for the chosen date. The OD-06 notice appears when the LV term is capped. German number input. "Als Entwurf speichern" or "Speichern & einreichen". |
| `/vertrieb/produktion/import` | Admin only. Pick a CSV (≤ 2 MB) → columns mapped (German headers fine) → staged in the DB → table with **one German error per row** → "N gültige Zeilen übernehmen". |
| `src/domain/points.ts` | TS mirror of the engine (Decimal, same order and keys). |
| `src/domain/csvImport.ts` | CSV parser (`;`/`,`, quotes, CRLF, BOM, multi-line cells), German header aliases, `monatlich/jährlich/einmalig`, `netto/brutto`, `TT.MM.JJJJ`, German decimals. Formula prefixes are stripped from text cells. Invalid numbers stay raw so the DB reports them. |
| `src/utils/dbErrors.ts` | German messages for **all** Phase 1 keys (hierarchy, rules, levels, production), which closes the gap noted in earlier slices. |
| `src/utils/format.ts` | `parseGermanDecimal` moved here, so domain code doesn't import a UI component (re-exported from FormFields). |
| `permissions.employeeId` | Own employee id while active. |

## How to verify
```bash
npm run test:db -- 060
npm test
npm run check:golden     # 17 shared case IDs
```
On staging:
1. As an adviser: enter the three §14.1 examples. The preview shows 10.5 / 25 (KV) / 5. Submit.
2. As finance with MFA: mark them "Anrechenbar". Points appear; the details show the formula.
3. Correct the LV premium to 120 (`rpc_correct_production`, SQL for now, see below). The ledger shows original, reversal and new original.
4. Cancel the KV record: it nets to 0.
5. Import a CSV with a duplicate Quelle-ID and an unknown Pers.-Nr.: only valid rows are taken over; re-importing the same file reports "Bereits importiert".

## What to look out for
- **No UI for corrections yet.** `rpc_correct_production` exists and is tested, but there's no form. Corrections of eligible records happen via cancel + new entry, or via SQL by an admin. Add a correction form when finance asks for it.
- **Eligibility is manual** (OD-08). If Profina decides "issued" or "paid" is the milestone and the portal can deliver it, the import can set `eligible` directly. That change belongs in `rpc_commit_production_import`.
- **Only EUR.** Non-EUR rows are refused (`currency_not_supported`), not converted.
- **Rule version = version in force on the production date** (OD-12). A record dated before 2026-01-01 can't be calculated (`no_rules_for_date`). Historical import before 2026 needs a rule version for that time.
- **Leaders can't enter for their team** yet (only the producer themselves, or an admin). That's a business decision; the place to change it is `app_private.assert_can_edit_production`.
- **Import size**: 5,000 rows per batch, staged in one transaction. Larger exports need splitting.
- **Career points** (next slice) will count only `eligible` records, summed from the ledger. Cancelled or corrected records therefore automatically drop out or change.

## Edge cases covered by tests
**Engine (both engines)**: all 17 golden cases above, plus
- capped-term flag and formula with the capped term
- unknown category
- non-numeric premium

**Entry**
- the producer creates a draft
- entering for someone else → `forbidden`
- gross Sach, before the producer's start date, a future date and a negative premium are refused with their keys
- drafts can be edited; submitted records can't (`not_editable`)
- no direct INSERT

**Lifecycle**
- the producer can't mark eligible; finance needs MFA
- eligible gives correct points and AE = P × 28, with the rule version recorded
- marking eligible twice is refused
- a correction needs a reason; the ledger becomes original → reversal → new original (12.6 / −12.6 / 10.5)
- cancelling an eligible record nets to 0; cancelling twice is refused
- the ledger can't be updated or deleted even by `postgres`
- a KV record carries KV points

**Visibility**
- the leader sees the team's production; a peer sees nothing (records or calculations)
- the producer can read the record history; a peer can't

**Import**
- 7 rows / 2 valid, with each error named (duplicate in file, unknown Pers.-Nr., gross Sach, invalid number, missing source id)
- only valid rows committed, as `submitted`
- one correlation id per batch
- a batch commits once
- re-importing a source id → `already_imported`

**Frontend**
- CSV parsing (quotes, escaped quotes, CRLF, BOM, comma files, multi-line cells, blank lines, trailing fields)
- date normalisation
- German header mapping, unknown/missing columns
- invalid numbers kept raw
- formula prefixes stripped
- form: live LV preview, Sach net/gross field and gross message, OD-06 notice, a non-number refused, `1.234,50` sent as `1234.50`
