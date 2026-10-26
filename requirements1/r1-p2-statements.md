# r1/p2/statements — Statement workflow, statements, export log

| | |
|---|---|
| Branch | `r1/p2/statements` → merged into `r1/p2-commission` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 2 · `r1/p2/statements`; spec §6.2, §6.3, §12.4, §14.2–14.3 |
| Status | Done; 20 new pgTAP assertions (370 total) |
| Date | 2026-10-26 |

## What was done — `20261026220000_statements.sql`
| Object | Notes |
|---|---|
| `rpc_set_statement_status(month, status, reason)` | Finance/admin + MFA + reason, audited. Transitions: `open → reviewed`, `reviewed → open` (reopen for corrections), `reviewed → approved`, `approved → paid`. **Approved and paid are final.** A month can't be approved before it has ended (`month_not_ended`). Since the ledger books only into `open` months, nothing changes in a reviewed/approved/paid month. |
| `rpc_statement(month, employee?)` | One person's month: **own production, direct differential, indirect differential** as separate buckets (§6.3), each with gross / reserve / after reserve / count, plus total and period status. Wording is never "take-home". Visibility = `can_see_commission_of` (own; finance/admin; leaders only with OD-17 on). |
| `rpc_statement_overview(month)` | Finance/admin: every recipient with totals. |
| `rpc_log_export(kind, scope, rows)` | Records exports in the audit trail (`export.<kind>`), §12.4. Overview/ledger exports are finance/admin only. The browser calls it right before building the CSV. |

The subsidy line on the statement comes with `r1/p2/subsidy`.

## How to verify
```bash
npm run test:db -- 100
```

## What to look out for
- **"Reviewed" isn't a lock for bookings into that month**: bookings already skip it, because only `open` months take entries. Reopening returns it to `open`, and new bookings land there again.
- The export log trusts the browser's row count; it records *that* an export happened and who did it, not the file itself.
- Payment export / reconciliation with the payroll system (§16 "Commission payment workflow") is still open.

## Edge cases covered by tests
- §14.2 on a real statement: FB own 560/56/504 and direct differential 280/28/252 in separate buckets; an empty indirect bucket is still present; total after reserve 756
- DL: differential on FB's points is direct, on FA's indirect
- an employee can't read a manager's statement; a leader can't read a team statement by default (OD-17)
- overview is finance-only, has 3 recipients, total 2,240 (2 × 10 P × 112 €); finance can read any statement
- workflow: open can't jump to approved; the running month can't be approved; reviewed can be reopened; a past month goes reviewed → approved → paid; paid is final; changes audited with the reason; MFA required
- export is recorded with its size
