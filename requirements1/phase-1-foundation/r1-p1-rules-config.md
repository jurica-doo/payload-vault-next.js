# r1/p1/rules-config — Versioned rules and career levels

| | |
|---|---|
| Branch | `r1/p1/rules-config` → merged into `r1/p1-foundation` |
| Plan section | IMPLEMENTATION_PLAN.md §3.2, §6 Phase 1 · `r1/p1/rules-config`; spec §1, §2, §3, §4.4, §13 |
| Status | Done; 46 new pgTAP assertions (197 total), 189 unit tests |
| Date | 2026-10-26 |

## What was done

### Database — `20261026170000_rules_config.sql`
| Object | Notes |
|---|---|
| `rule_versions` | `kind` (`levels` / `conversion`), label, `effective_from`, `status draft → published`, `ae_per_point` (conversion only). At most one published version per kind and date. **A published version and all its rows are immutable**: triggers refuse UPDATE/DELETE and adding rows, even for `postgres`. |
| `career_levels` | Per levels version: code FA…VD, rank 1–7, German name, rate per point, max subsidy, threshold, KV ratio, structure cap ratio. |
| `product_categories` | LV, KV, SACH, KFZ, STROM, GAS. **`is_kv` is a property of the category**, never inferred (§3.2). |
| `conversion_rules` | Per conversion version and category: formula kind (`lv_monthly_term`, `kv_monthly`, `sach_annual_net`, `none`), divisor, max LV term, required premium period, required net/gross. CHECK: `none` ⇔ no divisor. |
| `career_level_history` | Append-only (trigger). `source` = `initial` / `promotion` / `admin_correction`, with reason and approver. Levels are permanent: a correction is a new row, never an edit. |
| Seeds (effective 2026-01-01) | Exactly the spec values. Checked by tests against §2, §3, §4.4 and §17.2. The 50 % structure cap is set on **target** levels OL, DL, RL, VD (provisional, OD-04). LV term capped at 35 in the formula (OD-06). 1 P = 28 AE. |
| `app_private.rule_version_at(kind, date)` | The version in force on a date. |
| `app_private.level_at(employee, date)` | An employee's level on a date. |
| `rpc_rules_at(date)` | The rule set for a date as JSON. It feeds the admin page and the TypeScript preview engine (`src/domain/rules.ts`). |
| Draft RPCs (admin + MFA) | `rpc_create_rule_draft` copies the version in force (one draft per kind); `rpc_update_level_draft`; `rpc_update_conversion_draft` changes factors only (switching a category between points / no points is OD-18 and isn't offered); `rpc_delete_rule_draft`. |
| `rpc_publish_rule_version(id, reason)` | Validates and publishes. **Effective date must be in the future and after the latest version** (no retroactive rules until a recalculation workflow exists). Levels must be 7 with FA at 0 points, and rates **and** thresholds must strictly rise. Conversion needs a rule for every active category. |
| `rpc_set_employee_level(emp, level, from, reason)` | Admin + MFA + reason. The first entry is `initial`, later ones `admin_correction`. Refuses: before the start date, before the latest entry, same level. |
| `rpc_my_context()` | Now includes `level_code`. |
| RLS | Published rules are readable by every signed-in user; **drafts only by admins** (row policies follow the version policy). Level history follows employee visibility (self, structure, admin/finance/compliance). No direct writes. |

### Frontend
| Path | What |
|---|---|
| `/admin/regeln` | Per kind: the version in force (table), version history, and the draft editor. **Changed values are highlighted** against the version in force; rows are saved one at a time. Publishing asks for a reason and warns that it's final. Disabled without MFA. Categories without points are shown as not editable (OD-18). |
| `/admin/mitarbeiter` | New "Stufe" column ("fehlt" in red when no level is set) and a "Stufe" action: initial level (default: start date, prefilled reason) or a correction with a reason. The text points out that promotions go through the career check. |
| `src/domain/rules.ts` | `parseRules()` (throws on malformed numbers instead of guessing), `kvRequirement`, `levelByCode`, `nextLevel`, `LEVEL_CODES`. |
| `src/domain/__fixtures__/seededRules.ts` | The `rpc_rules_at` payload for the seeded values, so TS tests use exactly what the DB returns. |
| `src/hooks/useRules/useRules.ts` | `useRules(date)` and `useRuleAdmin()`. |

## Production rollout notes
- The migration seeds the spec values as **published** versions from 2026-01-01. Check them with Profina before Gate A. A wrong seed can only be replaced by a new version with a **future** date, by design.
- After rollout, every employee needs an initial level (`/admin/mitarbeiter` → "Stufe"). Until then the context shows `level_code: null`, and career/commission features (next slices) will refuse to calculate for them. That's intended (§16: never guess).

## How to verify
```bash
npm run test:db -- 050
npm test
```
On staging as admin:
1. On `/admin/regeln`, check the active tables match spec §2/§3.
2. Create a draft for next month and change FB's rate: the cell is highlighted.
3. Set TL's rate below FB's and publish: you get "levels_not_increasing" (message shown).
4. Fix it, publish with a reason: the history shows the new version, and the table switches on its date.
5. In `/admin/mitarbeiter`, set a level, then correct it.

## What to look out for
- **No retroactive rule changes.** If Profina corrects a rule for the past (e.g. after Gate A), we need a recalculation-and-correction workflow. Production and career currently compute with the version in force on the production date, so a past change would silently alter history; that's why publishing in the past is refused.
- **`rpc_update_conversion_draft` can't change formula kinds.** Adding a new product line with points needs a category plus a migration, deliberately.
- **Draft error messages** for the new keys (`draft_exists`, `levels_not_increasing`, `effective_date_not_future`, …) fall back to the generic text in the UI. Add German messages to `src/utils/dbErrors.ts` during the UX pass.
- Rates are visible to every employee (they're needed for previews). If Profina considers the rate table confidential per level, restrict `career_levels` reads, and have `rpc_rules_at` return only the caller's level.

## Edge cases covered by tests
**Seeds**
- levels, rates, max subsidies and thresholds equal spec §2
- KV minimums (10/30/75/150/400/900) and AE equivalents (2,800…252,000) equal §4.4/§17.2
- the cap only on OL+
- conversion rules equal §3
- 1 P = 28 AE
- only KV is tagged KV

**Lookup**
- no version before 2026-01-01; valid from its date
- old version before a new one's date, new version from it

**Immutability (as `postgres`)**
- published rows can't be updated, deleted or added to
- the version itself can't be changed or deleted
- `none` + divisor is refused

**Reading**
- `rpc_rules_at` returns 7 levels, the AE factor and the KV flag; nothing before 2026
- employees can't write rules, and don't see drafts or draft rows

**Drafts**
- admin only; one draft per kind; editable; published versions can't be edited via the RPC

**Publish validation**
- falling rate; falling threshold; FA ≠ 0
- reason required; MFA required
- retroactive and out-of-order dates refused
- a published version can't be deleted as a draft

**Levels**
- initial, then correction; same level / before start / before latest refused
- `level_at` before and on the correction date
- the context shows the current level
- the history is append-only

**TS**
- `parseRules` (decimals, null subsidy, KV requirement, next level / top level, no rules, malformed number throws)
