# Profina Sales & Management System — Implementation Plan

> Source: `requirements1/Profina_Sales_Management_System_Technical_Specification_EN.pdf` (v1.0, 25 Oct 2026).
> Plan written 26 Oct 2026 against `main` @ 7a99740 (merged into `feat/requirements1` @ f936635).
> Section references like **§5.3** point to the spec.

---

## 0. Context

### Why
Profina needs one connected system for production, points/AE, career progress, hierarchy, differential commission,
reserve, subsidies, goals, leads, customers and follow-up work, with auditable calculations and role-based access (§1).
Today this codebase is a **single-user private vault** (income PDFs, tax-relevant expenses, statistics, analytics).

### Decisions already taken
| # | Decision | Consequence |
|---|---|---|
| D1 | The existing vault (Einnahmen, Steuerrelevante Ausgaben, Statistiken, Analysen) **stays as a private module** | Its tables keep `auth.uid() = user_id` RLS. Leaders and admins can **never** read another user's vault. The sales system is a new, separate section. |
| D2 | **Admin invites** employees; public signup is switched off | `signup_allowlist` is replaced by `employee_invites`; the auth trigger only allows emails with a pending invite. |
| D3 | **`feat/requirements1` is the integration branch** | Phase branches come off it, slice branches come off phase branches, and it merges to `main` only at delivery gates (§15). |

### Current architecture (what we build on)
- Next.js 16.2.6 (App Router, `proxy.ts` nonce CSP, every route dynamic), React 19, TanStack Query 5, zod 4, Tailwind 4, Recharts 3.
- **Client-only data access**: `src/lib/supabase.ts` (anon key, browser session). No server Supabase client, no route handlers, no server actions.
- **Security lives in Postgres**: RLS on every table, explicit grants (`20260603120000_explicit_data_api_grants.sql`), hardened functions (`20260603130000_harden_get_user_report_years.sql`), allowlist trigger, `consume_rate_limit` (service_role only).
- One Edge Function (`extract-data-from-expense-image`) doing its own JWT auth, CORS via `APP_ORIGIN`, a rate limit and a size cap.
- Hook pattern: `src/hooks/useAnalytics/useIncomeGoals.ts`, with `useQuery`/`useMutation` and query keys `[entity, userId, scope]`.
- UI: `Button`, `InputField`, `Dropdown`, `Modal` + `ModalContext`, `ContentCard`, `SegmentedToggle`, `EmptyState`, `ErrorBlock`, `SkeletonLoader`, `BulkActionBar`, `SearchBar`, `Banner`. German route slugs and copy.
- **No tests, no CI.** This must change before any financial logic is written (§15 Gate B).

---

## 1. Architecture principles for the new system

1. **The database is authoritative for every number that matters.** Points, AE, KV tagging, career credits, structure caps,
   qualification status and commission ledger entries are computed **only** by Postgres functions and triggers. The browser
   never inserts or updates computed tables: no grants for `authenticated`, and writes happen through `SECURITY DEFINER` functions.
2. **A TypeScript mirror only for previews.** `src/domain/` contains pure, side-effect-free functions for live form previews
   ("this LV contract will give 10.5 P") and the career simulator. They never feed stored results.
   The SQL engine and the TS engine are tested against **the same golden cases** (§17 examples plus edge cases) using identical case IDs.
3. **Everything versioned and effective-dated** (§1, §13.2): levels, rates, conversion rules, hierarchy, subsidies.
   Every calculated row stores the `rule_version_id` it used.
4. **Append-only financial history.** The commission ledger, career level history and audit events are never updated or deleted.
   Corrections are reversal + adjustment entries. Approved statement periods are locked.
5. **Never invent a rule silently** (§16). Every open decision has an `OD-xx` ID (section 9). Code that depends on one either
   reads a configurable setting with a **provisional default flagged in the UI**, or routes the record to the **admin exception queue**.
6. **Private helpers live in a non-exposed schema.** All `SECURITY DEFINER` helpers go in `app_private`, which is not exposed through
   PostgREST, so they can't be called as RPCs. Public RPCs are thin wrappers that check permissions first.
7. **Feature flags per module** (`app_settings.feature_flags`) so unfinished modules can merge into the integration branch while hidden.
8. **German UI, English code.** Routes and copy follow the existing German convention (`/vertrieb/...`). Identifiers, tables and comments are English.

### Precision & time conventions (apply everywhere)
| Quantity | Storage | Rule |
|---|---|---|
| Points, KV points | `numeric(14,4)` | Full precision stored; displayed to 2 dp (provisional, **OD-07**) |
| AE | `numeric(16,4)` = points × 28 | Never rounded before storage; displayed as integer with `de-DE` grouping |
| Money | `numeric(14,2)` | Rounded **half-up once per ledger entry**: gross is rounded; reserve = round(gross × 0.10); net = gross − reserve (so sums always reconcile) |
| Business dates | `date` | Interpreted in **Europe/Berlin**. Period boundaries are `[start, end)` half-open (provisional, **OD-01**) |
| Timestamps | `timestamptz` default `now()` | Never `timezone('utc', now())` (see `20261026120000`) |
| TS money/points | `decimal.js` | No JS floats for financial maths |

---

## 2. Branching model & workflow

```
main ──────────────────────────────────────────────── (gate merges only)
 └─ feat/requirements1   (integration; docs + all merged phases)
     ├─ r1/p0-groundwork
     │    ├─ r1/p0/tooling
     │    ├─ r1/p0/ui-kit
     │    └─ r1/p0/app-shell
     ├─ r1/p1-foundation
     │    ├─ r1/p1/audit
     │    ├─ r1/p1/identity-roles
     │    ├─ r1/p1/hierarchy
     │    ├─ r1/p1/rules-config
     │    ├─ r1/p1/production
     │    └─ r1/p1/career-engine
     ├─ r1/p2-commission   (rate-matrix, ledger, statements, subsidy, finance-ui)
     ├─ r1/p3-cockpit      (goals, dashboards, career-progress, profiles-coaching, forecast)
     ├─ r1/p4-leads-tasks  (task-engine, activities, leads, lead-analytics)
     ├─ r1/p5-crm          (customers, consent, contract-links, service-reminders, privacy-ops)
     └─ r1/p6-automation   (email-templates, email-engine, advanced-analytics)
```
Rules:
- Slice branch → PR into its **phase** branch; phase branch → PR into `feat/requirements1` once the phase's tests pass;
  `feat/requirements1` → `main` only after the matching **gate** (section 8) is signed off.
- Rebase slice branches on their phase branch daily. Merge `feat/requirements1` into each open phase branch after every phase merge.
- **Migrations**: one migration per slice, timestamped at creation. Never edit a migration that has merged into the integration branch.
  After each migration, run `npm run types` and commit `src/types/supabase.ts`.
- Every PR must have: the migration, pgTAP tests (RLS + logic), Vitest tests (domain/hooks), an updated `OD` register if a provisional rule was used, and screenshots for UI.
- Production Supabase is touched **only** from `main` and only after the gate.
  Use a separate **staging Supabase project** with synthetic data for the integration branch (§12.4: "separate production and test data").

---

## 3. Data model (target state)

Schemas: `public` (exposed, RLS on every table), `app_private` (helpers, not exposed), `audit` (audit tables, not exposed; read through RPC).

### 3.1 Identity, roles, hierarchy (Phase 1)
| Table | Key columns | Notes |
|---|---|---|
| `employees` | `id uuid pk`, `user_id uuid unique null → auth.users`, `employee_no text unique`, `first_name`, `last_name`, `email citext unique`, `phone`, `start_date date`, `status (invited/active/inactive)`, `employment_type (full_time/part_time)`, `timezone default 'Europe/Berlin'`, `deactivated_at` | `user_id` is null until the invite is accepted. Soft-deactivate only; never deleted. |
| `employee_invites` | `email citext`, `employee_id`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at` | Replaces `signup_allowlist`. The auth trigger checks for a pending, unexpired invite. |
| `user_roles` | `user_id`, `role app_role`, `granted_by`, `granted_at`, `revoked_at` | `app_role` = `admin`, `finance`, `compliance`. "Team leader" and "higher leader" are **derived from the hierarchy**, not granted. |
| `career_levels` | `id`, `code (FA..VD)`, `rank 1..7`, `name_de`, `point_rate numeric(10,2)`, `max_subsidy numeric(10,2) null`, `threshold_points numeric`, `kv_min_ratio numeric default 0.10`, `structure_cap_ratio numeric null`, `effective_from`, `effective_to`, `rule_version_id` | Versioned. Seeded from §2 and §4.4. |
| `career_level_history` | `employee_id`, `level_id`, `effective_from`, `source (initial/promotion/admin_correction)`, `evidence jsonb`, `approved_by`, `reason` | Append-only. "Current level" = the latest row. Levels are permanent once earned (§2). |
| `hierarchy_assignments` | `employee_id`, `manager_id null`, `effective_from date`, `effective_to date null`, `change_reason`, `approved_by` | Exclusion constraint: no overlapping ranges per employee. Trigger blocks cycles and self-reference. |
| `hierarchy_closure` | `ancestor_id`, `descendant_id`, `depth` | The **current** closure, rebuilt by trigger. Used only for RLS/visibility speed. Historical attribution uses `app_private.ancestors_at(emp, date)`. |

### 3.2 Rules & production (Phase 1)
| Table | Key columns | Notes |
|---|---|---|
| `rule_versions` | `id`, `kind (levels/conversion/rates/career)`, `label`, `effective_from`, `approved_by`, `approved_at`, `notes` | One immutable row per approved rule set. |
| `product_categories` | `code (LV/KV/SACH/STROM/GAS/KFZ/…)`, `name_de`, `generates_points bool`, `is_kv bool`, `active` | §13.2: explicit flags. KV is a flag, never inferred (§3.2). |
| `conversion_rules` | `category_code`, `rule_version_id`, `formula_kind (lv_monthly_term / kv_monthly / sach_annual_net / none)`, `divisor numeric`, `max_term_years int null`, `required_premium_period`, `required_net_gross` | Data-driven formulas: no hard-coded divisors in code. |
| `production_records` | `id`, `producer_id`, `category_code`, `product_reference`, `premium_amount numeric(12,2)`, `premium_period (monthly/annual/one_off)`, `net_or_gross`, `currency char(3) default 'EUR'`, `term_years numeric null`, `production_date date`, `status (draft/submitted/validated/eligible/cancelled/reversed)`, `source (manual/import)`, `source_system`, `source_system_id`, `import_batch_id`, `created_by`, `customer_id null`, `lead_id null` | Unique `(source_system, source_system_id)`. Points are calculated only at the eligibility milestone (**OD-08**). |
| `point_calculations` | `production_id`, `rule_version_id`, `points`, `ae`, `kv_points`, `details jsonb` (inputs, formula text, intermediate values), `calculated_at`, `superseded_by null` | Written only by trigger. Recalculation inserts a new row and supersedes the old one. |
| `import_batches` / `import_rows` | batch metadata; raw row jsonb, `validation_errors`, `status` | Staging for CSV imports, so bad rows never reach `production_records`. |

### 3.3 Career (Phase 1)
| Table | Key columns | Notes |
|---|---|---|
| `career_periods` | `employee_id`, `period_type (first_personal/transition/calendar)`, `start_date`, `end_date` (exclusive), `status (open/closed)`, `rule_version_id` | Generated by function and stored, never derived on the fly (§4.2). |
| `career_credits` | `employee_id`, `period_id`, `target_level_id`, `source_structure_id null` (null = personal), `gross_points`, `gross_kv_points`, `eligible_points`, `eligible_kv_points`, `cap_applied bool`, `cap_value`, `calculation_version`, `calculated_at` | Snapshot recalculated after every eligible production change in scope. |
| `qualification_status` | `employee_id`, `period_id`, `target_level_id`, `eligible_points`, `eligible_kv_points`, `points_required`, `kv_required`, `is_ready bool`, `blocking_reasons text[]` | Drives the progress UI and the promotion queue. |
| `promotion_requests` | `employee_id`, `target_level_id`, `evidence jsonb`, `status (ready/approved/rejected)`, `decided_by`, `decided_at`, `reason` | Promotion is a reviewed action, not a silent auto-update (provisional, **OD-15**). |

### 3.4 Commission & subsidy (Phase 2)
| Table | Key columns | Notes |
|---|---|---|
| `rate_tables` / `rate_pairs` | per `rule_version_id`: `recipient_level`, `relative_to_level`, `rate_per_point` | Holds the confirmed matrix once **OD-05** is answered; the differential algorithm reads from it. |
| `statement_periods` | `period_month date`, `status (open/calculated/reviewed/approved/exported/paid)`, `locked_at`, `locked_by` | Writing ledger rows into a locked period is rejected by trigger. |
| `commission_ledger` | `id`, `production_id`, `calculation_id`, `producer_id`, `recipient_id`, `relationship (self/direct/indirect)`, `depth`, `producer_level_id`, `recipient_level_id`, `commission_type (personal/differential)`, `entry_kind (original/reversal/adjustment)`, `reverses_entry_id`, `points`, `rate_basis`, `rate_per_point`, `gross_amount`, `reserve_amount`, `net_after_reserve`, `statement_period_id`, `rule_version_id`, `status`, `created_at` | **Append-only** (no UPDATE/DELETE grants, plus a trigger guard). Unique `(calculation_id, recipient_id, commission_type, entry_kind)` stops duplicate roll-up (§5.4). |
| `reserve_movements` | `ledger_id`, `kind (withheld/released/clawed_back)`, `amount`, `approved_by` | The reserve is its own component (§6.2). Release/clawback rules are **OD-10**. |
| `subsidy_records` | `employee_id`, `effective_month`, `max_amount_snapshot`, `approved_amount`, `approval_status`, `coverage_basis jsonb`, `approver_id`, `notes` | CHECK: approved ≤ snapshot ceiling, unless an admin override with reason (§6.4). |
| `exception_queue` | `entity_type`, `entity_id`, `reason_code`, `details jsonb`, `status`, `resolved_by` | Shared by every "cannot calculate confidently" case (§11.2, §16). |

### 3.5 Management (Phase 3)
`monthly_goals` + `monthly_goal_versions` (immutable submitted versions), `goal_reviews` (approve/return + comment),
`coaching_sessions`, `coaching_actions`, `coaching_notes (visibility: private_manager / shared)`, `review_checklists`.

### 3.6 Leads, activities, tasks (Phase 4)
`lead_stages` (configurable, ordered, required fields per stage), `leads`, `lead_stage_history`, `lead_assignments` (history + reason),
`lead_sources` (+ cost), `activities` (calls, emails, appointments; shared by leads and customers), `tasks`, `task_reminders`,
`notifications`, `notification_preferences`, `business_calendar` (holidays per Bundesland for SLA), `sla_policies`.

### 3.7 CRM & communication (Phases 5–6)
`customers`, `customer_consents` (purpose, legal basis, source, granted/withdrawn timestamps), `communication_preferences`,
`contract_links`, `sync_runs` / `sync_errors`, `email_templates` + `email_template_versions` (approval), `email_campaigns`,
`email_suppressions`, `email_send_log`, `email_global_switch`.

### 3.8 Cross-cutting
`audit.events` (`actor_id`, `action`, `entity_type`, `entity_id`, `old jsonb`, `new jsonb`, `reason`, `correlation_id`, `at`),
`app_settings` (feature flags, SLA hours, provisional-rule toggles), `export_log` (who exported what, how many rows).

---

## 4. Security model

### 4.1 Roles & scope (§12)
| Actor | How it is determined | Sees |
|---|---|---|
| Adviser | Any active employee | Own employee row, own production/points/career, own ledger, own goals, own leads/tasks, permitted customers |
| Team leader / higher leader | Has descendants in `hierarchy_closure` | Above, plus descendants' **operational** data. Descendants' commission/subsidy amounts only if `app_settings.leader_sees_team_commission` (**OD-17**) |
| Finance | `user_roles.finance` | Ledger, statements, reserve, subsidy within assigned scope. **No** coaching notes, **no** customer PII beyond names |
| Compliance | `user_roles.compliance` | Consents, communication logs, audit events (read-only) |
| Admin | `user_roles.admin` + **MFA aal2** | Configuration, users, corrections, exception queue, audit |
| Everyone | — | **Never** another user's private vault (`pdf_records`, `expenses`, `budget_targets`, `income_goals`) |

### 4.2 Enforcement building blocks (`r1/p1/identity-roles`)
- `app_private.current_employee_id()` — `STABLE SECURITY DEFINER`, cached per statement with `(select …)`.
- `app_private.has_role(role)`, `app_private.is_admin_aal2()` (checks `auth.jwt()->>'aal' = 'aal2'`).
- `app_private.can_see_employee(target uuid)` = self, or an ancestor in `hierarchy_closure`, or admin/finance/compliance as appropriate.
- RLS template for hierarchy-scoped tables: `USING (app_private.can_see_employee(owner_col))`.
- Write paths for sensitive changes are `public.rpc_*` functions that: check the permission → validate input → write → write the audit event, all in one transaction.
  The `authenticated` role has **no direct INSERT/UPDATE** on: `career_level_history`, `hierarchy_assignments`, `point_calculations`,
  `career_credits`, `qualification_status`, `commission_ledger`, `reserve_movements`, `statement_periods`, `subsidy_records`, `audit.events`, `rule_versions`.
- Every `SECURITY DEFINER` function: `SET search_path = ''` (fully qualified names), `REVOKE EXECUTE … FROM PUBLIC, anon`,
  `GRANT` only to the role that needs it (pattern from `20260907122000_edge_rate_limits.sql`).
- Every new table: `ENABLE ROW LEVEL SECURITY`, explicit grants (pattern from `20260603120000`), a pgTAP test proving
  (a) anon gets nothing, (b) a peer can't see it, (c) a manager sees descendants, (d) a manager can't see their own ancestors' data.

### 4.3 Authentication changes
- Disable public signup in Supabase Auth settings. Replace the `enforce_signup_allowlist` trigger with `enforce_employee_invite`, which requires a pending, unexpired invite.
- New Edge Function `invite-employee` (admin + aal2 only, verifies the JWT like `extract-data-from-expense-image` does).
  It uses the service role to call `auth.admin.inviteUserByEmail`, is rate-limited with `consume_rate_limit`, and writes an audit event.
- **MFA (TOTP) mandatory for admin and finance** (§12.2). The UI enrolment flow goes in `/profil/sicherheit`. RLS rejects their writes at `aal1`.
- On invite acceptance, a trigger links `auth.users.id` → `employees.user_id` by email (case-insensitive, `citext`).
- Deactivating an employee: `status = inactive`, all sessions revoked through the Edge Function (`auth.admin.signOut`),
  open leads/tasks go to the manager's reassignment queue, and history is kept.
- The `/signup` page becomes "accept invite / set password". Keep the existing "Database error saving new user" text for now (UX later, per user).

### 4.4 Other controls
- **Audit triggers** (`audit.log_change()` generic trigger) on everything listed in §12.3: career level, reporting line, production values,
  product category, conversion rule, rates, reserve, subsidy, lead ownership, consent, email templates. A `reason` is required:
  the RPCs take `p_reason text NOT NULL` and pass it through `set_config('app.reason', …, true)` so the trigger records it.
- **Exports**: go through RPCs that write `export_log` and are capped per hour (`consume_rate_limit` keyed by user).
  CSV uses the existing `escapeCsvValue` in `src/utils/csvExport.ts`.
- **Imports**: parsed client-side → uploaded as rows to `import_rows` → validated by a DB function. Formula-injection characters are stripped on import too.
- **Soft delete** (`archived_at`) for operational records. Financial and audit records can't be deleted (no DELETE grant + trigger guard).
- **PII minimisation**: date of birth stored only when birthday mail consent exists (§10.1). Phone numbers normalised to E.164, emails to lowercase `citext`.
- **CSP**: unchanged. All third-party calls (email provider, contract portal) happen in Edge Functions; `connect-src` stays Supabase only.
- **Staging data**: synthetic seeds only (`supabase/seed.sql` + `scripts/seed-synthetic.ts`). No production export ever goes into staging.

---

## 5. Reusable building blocks

### 5.1 UI kit (`r1/p0/ui-kit`, in `src/components/`, following the existing `Component.tsx / .types.ts / .const.ts` layout)
| Component | Purpose | Builds on |
|---|---|---|
| `DataTable` | Typed columns, sorting, server-side pagination, row selection, empty/loading/error states, sticky header, mobile card layout | `EmptyState`, `ErrorBlock`, `DocumentSkeletonLoader`, `BulkSelectContext` |
| `KpiTile` | Label, value, unit, delta vs prior period, "estimate" badge | Generalises `TotalIncomeCard` |
| `ProgressMeter` | Two-track progress (total points + KV points) with cap markers and a pace indicator | new |
| `CalculationBreakdown` | "Woher kommt diese Zahl?" drawer: inputs → formula → rule version → result, with source record links (§1 "Explainable") | `Modal` (size `large`) |
| `MoneyValue` / `PointsValue` / `AeValue` | `de-DE` formatting, gross/net labels, never "take-home" (§6.3) | `src/utils/format.ts` (new) |
| `StatusBadge` | Generic status → colour/label map | new |
| `PeriodSelector` | Month / career period / calendar year / custom range | Extends `YearContext` → `PeriodContext` |
| `EmployeePicker` | Searchable, hierarchy-scoped, shows level + manager | `Dropdown`, `SearchBar`, `HighlightText` |
| `HierarchyTree` | Lazy-loaded expand/collapse tree with per-node KPIs and keyboard navigation | new |
| `AuditTimeline` | Old → new diff, actor, reason, timestamp | new |
| `ReasonConfirmModal` | Confirm action + required reason (reassign, override, correction) | `ConfirmDeleteModal` pattern |
| `FormSelect`, `DateInput`, `TextArea`, `CurrencyInput`, `NumberInput` | Fill the gaps in `InputField` (text/email/number only) | `InputField` styles |
| `FunnelChart`, `TrendChart` | Recharts wrappers that always render a denominator/time-window caption (§8.2) | Recharts patterns in `src/views/statistics` |
| `RoleGate` | Renders children only if the permission matches (UX only; the DB still enforces) | `usePermissions` |
| `ProvisionalRuleNotice` | Inline banner: "Vorläufige Regel (OD-xx), noch nicht von Profina bestätigt" | `Banner` |
| `StageStepper` | Lead pipeline stage indicator | `SegmentedToggle` styles |

### 5.2 Hooks & libraries
- `src/hooks/query/keys.ts` — a query-key factory (`qk.employees.list(scope)`, `qk.ledger.byPeriod(id)` …) to keep invalidation consistent.
- `usePermissions()` / `useCurrentEmployee()` — one cached RPC `rpc_my_context()` returning employee, level, roles, aal, descendant count, feature flags.
- Per-module hooks in the `useIncomeGoals` style: `useEmployees`, `useHierarchy`, `useProduction`, `useCareerProgress`, `useLedger`,
  `useStatements`, `useSubsidies`, `useGoals`, `useLeads`, `useTasks`, `useCustomers`, `useTemplates`.
- `src/domain/` (pure TS, 100% unit-tested): `points.ts`, `ae.ts`, `careerPeriods.ts`, `qualification.ts` (KV + cap),
  `differential.ts`, `reserve.ts`, `funnel.ts`, `forecast.ts`, `sla.ts` (business hours), `normalize.ts` (phone/email/name for dedupe).
- `src/domain/__fixtures__/goldenCases.ts` — the shared golden cases. `supabase/tests/*.sql` (pgTAP) uses the **same case IDs**,
  and a small script (`scripts/check-golden-parity.ts`) fails CI if an ID exists on one side only.
- `src/validation/*` — zod schemas per form, mirrored by DB CHECK constraints.

---

## 6. Phases, branches and slices

Each slice lists: **Scope → DB → UI → Edge cases → Tests → Done when**.

### Phase 0 — Groundwork · `r1/p0-groundwork`

#### `r1/p0/tooling`
- **Scope**: Vitest + @testing-library/react; pgTAP via `supabase test db`; `decimal.js`; GitHub Actions CI
  (lint, `tsc --noEmit`, Vitest, `supabase start && supabase db reset && supabase test db`, golden-parity check);
  a staging Supabase project; `supabase/seed.sql` with synthetic users at every level; an RLS test helper that sets `request.jwt.claims` per test user.
- **Done when**: CI is green on an empty test suite, and a sample RLS test on the existing `expenses` table proves own-row isolation.

#### `r1/p0/ui-kit`
- **Scope**: every component in 5.1, with no data dependencies. Light/dark tokens, mobile layout at 360 px, keyboard focus, `aria-*`.
- **Edge cases**: long German labels (wrapping), negative money (reversals shown with a minus sign and colour), very large AE numbers, empty tables, 0-denominator funnels ("–" not "NaN %").
- **Done when**: each component has unit tests and a `/dev/ui` showcase route (dev only, behind `NODE_ENV`).

#### `r1/p0/app-shell`
- **Scope**: a new top-level "Vertrieb" section in `NavigationDropdown` (role-aware), a `SalesShell` layout (reusing `HeaderHome`),
  route skeletons behind feature flags, and `rpc_my_context()` + `usePermissions`.
- **Routes**: `/vertrieb` (dashboard), `/vertrieb/produktion`, `/vertrieb/karriere`, `/vertrieb/team`, `/vertrieb/provisionen`,
  `/vertrieb/ziele`, `/vertrieb/leads`, `/vertrieb/kunden`, `/vertrieb/aufgaben`, `/admin/*`.
  The existing vault routes don't change.
- **Edge cases**: a user with an auth account but no employee row (legacy vault-only users) sees **only** the vault, without errors.
- **Done when**: navigation shows the correct sections for the adviser, leader, admin and vault-only seed users.

### Phase 1 — Core foundation · `r1/p1-foundation` (§15 Phase 1)

#### `r1/p1/audit` (first, because everything else attaches to it)
- **DB**: `audit` schema, `audit.events`, the generic `audit.log_change()` trigger (captures `app.reason` and `app.correlation_id`), and `rpc_audit_for(entity_type, entity_id)` with permission checks.
- **Edge cases**: bulk imports (one correlation ID per batch), system actors (cron → `actor_id = null`, `actor_kind = 'system'`), large jsonb diffs (store only changed keys).
- **Tests**: the trigger records old/new/reason; `authenticated` can't insert/update/delete audit rows; compliance can read them, advisers can't read others'.

#### `r1/p1/identity-roles`
- **DB**: `employees`, `employee_invites`, `user_roles`, `app_private` helpers (4.2), the `enforce_employee_invite` trigger replacing the allowlist,
  and a link trigger for invite acceptance. Migrate existing allowlisted users into `employees` as `active` (admin assigns level/manager afterwards).
- **Edge Function**: `invite-employee` (admin/aal2, rate-limited, audited); `deactivate-employee` (revokes sessions).
- **UI**: `/admin/mitarbeiter` (list, invite, deactivate, roles), MFA enrolment, the invite-acceptance page.
- **Edge cases**: invite email with different casing; expired invite; re-inviting a deactivated employee (reactivate, don't duplicate);
  an admin removing their own admin role (blocked if they're the last admin); employee number collisions; an auth user deleted in the dashboard (employee row stays, `user_id` set to null).
- **Done when**: Gate D-style RLS tests pass for employees and roles; admin actions fail at aal1.

#### `r1/p1/hierarchy`
- **DB**: `hierarchy_assignments` (exclusion constraint on `daterange`), cycle-prevention trigger (recursive check at the effective date),
  `hierarchy_closure` maintenance, `app_private.ancestors_at(emp, date)`, `rpc_transfer_employee(emp, new_manager, effective_from, reason)`.
- **UI**: `/vertrieb/team` (tree + direct/indirect lists), `/admin/hierarchie` (transfers with reason, history), `HierarchyTree`.
- **Edge cases**: roots without a manager (top VD or approved exception, §5.1); self-manager; cycle created by a future-dated transfer;
  a transfer dated back into a **locked statement period** (rejected → exception queue); a manager deactivated while they still have reports
  (reports keep the inactive manager for attribution, and a reassignment task is created); an employee whose level is above their manager's
  (allowed, flagged, and handled by the differential algorithm); deep trees (≥ 10 levels; closure-index performance test with 5k synthetic employees).
- **Tests**: "a new subordinate under a subordinate becomes part of the higher leader's indirect structure" (§14.3); a transfer never changes ancestors for dates before `effective_from`.

#### `r1/p1/rules-config`
- **DB**: `rule_versions`, `career_levels` (seeded with §2 + §4.4 values), `product_categories` (LV, KV, SACH as point-generating; STROM, GAS, KFZ as `generates_points = false`, §3.4),
  `conversion_rules` (LV ÷ 4000 with max term 35; KV ÷ 28; SACH ÷ 200 annual net), and `rpc_publish_rule_version` (admin/aal2, reason, effective date, never retroactive into locked periods).
- **UI**: `/admin/regeln` (read-only view of the active version, a draft editor, a side-by-side diff before publishing).
- **Edge cases**: two versions with the same `effective_from`; publishing a version that starts in the past (allowed only for open periods; triggers recalculation with a preview of affected records); editing a published version (impossible — create a new one).

#### `r1/p1/production`
- **DB**: `production_records`, `point_calculations` (trigger on status → `eligible`), `import_batches`/`import_rows`, `rpc_validate_import(batch)`, `rpc_commit_import(batch)`.
  Points formulas follow `conversion_rules`; `details` stores the full formula string and inputs (§14.1 "displays inputs, formula and rule version").
- **TS mirror**: `src/domain/points.ts` gives a live preview in the form.
- **UI**: `/vertrieb/produktion` (list, entry form with live preview and `CalculationBreakdown`), CSV import wizard (upload → validate → review errors → commit).
- **Edge cases**: LV term > 35 (cap the formula term at 35, store the actual term, flag **OD-06**); LV term ≤ 0 or missing → validation error; KV entered as an annual premium (convert ÷12 or reject per rule; provisional: reject, with a message);
  Sach entered gross instead of net → reject (the rule requires annual net, §3.3); non-EUR currency → exception queue; negative premium → allowed only as `reversal` with a link to the original;
  STROM/GAS/KFZ → stored with 0 P/0 AE and visible in sales activity (§3.4); duplicate `source_system_id` → import row rejected;
  production dated before the employee's `start_date` → exception; production for an inactive employee → allowed if dated while active;
  status regression (eligible → cancelled) → a reversal calculation row (never delete); a premium change after eligibility → reversal + new calculation.
- **Tests**: all §14.1 / §17.1 golden cases in Vitest **and** pgTAP (LV 100/35 → 10.5; KV 700 → 25 tagged KV; Sach 1000 → 5; Kfz → 0/0; AE = P × 28).

#### `r1/p1/career-engine`
- **DB**: `career_periods` generation (`app_private.generate_periods(emp)`), `career_credits`, `qualification_status`, `promotion_requests`,
  `app_private.recalc_career(emp, period)` (called after eligible production changes for the producer **and every ancestor at the production date**),
  and a pg_cron job at 00:15 Europe/Berlin that closes ended periods and opens the next ones.
- **Period algorithm (provisional, OD-01/OD-02)**: `first_personal` = `[start_date, start_date + 1 year)`; `transition` = `[that end, next 1 Jan)` if non-empty; then `calendar` periods.
  For a start date of 1 Jan, the transition period is empty, so it's skipped. For a start date of 29 Feb, + 1 year = 1 Mar (Postgres interval semantics, documented).
- **Qualification algorithm**: target = next level above the current one. Personal points count without a cap. Each direct report's whole subtree is one "structure" (provisional, **OD-04**).
  If the target rank ≥ OL (i.e. the candidate is TL or higher) and `structure_cap_ratio` is set: credited per structure = min(gross, 0.5 × target threshold).
  Eligible KV per capped structure = gross KV × (eligible ÷ gross) — proportional and conservative (**OD-03**). Ready iff eligible total ≥ threshold **and** eligible KV ≥ 10% × threshold.
- **UI**: `/vertrieb/karriere` (period, required/credited/remaining, KV track, per-structure caps, period end, pace — §7.4), promotion queue at `/admin/befoerderungen`.
- **Edge cases**: promotion mid-period (new target from the approval date; whether surplus points carry over → **OD-02**, provisional: no carry-over); multi-level jump in one period (one level at a time, re-evaluated immediately);
  backdated production into a closed period (→ exception queue, no silent reopening); a reversal that takes a promoted employee below the threshold (level is kept — permanent, §4.3 — and flagged for admin review);
  a structure whose root transfers out mid-period (attribution by production date); a candidate with zero structures; recalculation storms (debounce per employee with `pg_advisory_xact_lock`).
- **Tests**: §14.4 (FB with 100 P / 7 KV → not ready; ≥10 KV → ready; 750 target → max 375 from one structure; reset keeps history and level; first year by start date, then calendar).
- **Gate B** at the end of Phase 1: all calculation tests green in both engines.

### Phase 2 — Commission engine · `r1/p2-commission` (§15 Phase 2) — starts only after Gate A answers OD-05, OD-08, OD-10

#### `r1/p2/rate-matrix`
- Config tables plus admin UI for rate pairs. Until **OD-05** is approved, use the **provisional "rate-compression" algorithm** and show `ProvisionalRuleNotice` on every differential number:
  walk up the ancestors of the producer *at the production date*; `paid_rate = producer_rate`; for each ancestor:
  `diff = max(0, ancestor_rate − paid_rate)`; if `diff > 0` create an entry and set `paid_rate = ancestor_rate`.
  This reproduces every worked example (FB/FA €28, TL/FB €14, DL/TL €42, §5.3), never pays more than the top rate in total (no double payment), and pays 0 to an ancestor whose level ≤ the highest rate already paid below.
- **Edge cases**: ancestor level equal to or lower than the producer's → 0, plus an informational exception; inactive ancestor → configurable (provisional: still receives, flagged); a rate change between production and approval → use the rule version effective at `production_date` (**OD-12**).

#### `r1/p2/ledger`
- `app_private.generate_ledger(calculation_id)`, run when a calculation becomes eligible; idempotent via a unique key; serialised with `SELECT … FOR UPDATE` on the calculation.
  Personal entry = points × producer rate; differential entries per the algorithm above; reserve = 10% on every entry (§6.1) as a separate `reserve_movements.withheld` row.
- Reversal on a cancelled or corrected production: mirrored negative entries in the **current open** statement period, linked via `reverses_entry_id`.
- **Tests**: §14.2 / §17.3 (FB 10 P → 560 / 56 / 504; differential 280 / 28 / 252); the sum over the ancestors of one production equals top rate × points minus the producer rate (when the chain reaches the top rate);
  generation is idempotent when called twice; no UPDATE/DELETE is possible.

#### `r1/p2/statements`
- `statement_periods` lifecycle calculated → reviewed → approved → exported/paid (finance + aal2). Locking prevents new non-adjustment entries.
  Statement view: personal vs direct differential vs indirect differential vs reserve vs after-reserve vs subsidy, each shown separately (§6.3).
  Export = an audited CSV/PDF using the existing jsPDF/autotable utilities in `src/utils/taxReport`.
- **Edge cases**: a hierarchy change after approval doesn't alter the approved statement (§14.3); an adjustment after `paid` goes into the next open period; disputes (`disputed` status with notes).

#### `r1/p2/subsidy`
- `subsidy_records` with approval workflow, ceiling snapshot, coverage basis, and a monthly review task (§11.2). Shown separately from commission and never counted as points.
- Pro-rating, pauses and reclaims → **OD-09** (provisional: manual approved amount only, no automation).

#### `r1/p2/finance-ui`
- `/vertrieb/provisionen` (own), `/vertrieb/team/provisionen` (leader, if allowed), `/admin/abrechnung` (finance): drill-down total → producer → production → calculation (`CalculationBreakdown`).
- **Gate C**: reconcile ≥ 10 real anonymised cases against Profina's manual calculation before merging to `main`.

### Phase 3 — Management cockpit · `r1/p3-cockpit` (§15 Phase 3)
- `r1/p3/goals` — monthly goal submit → manager approve/return with comment; versions stay immutable (§7.2). Fields from §7.2.
  **Edge cases**: a goal submitted after the month starts (allowed, flagged); a manager approving their own goal (blocked; routes to their manager); a manager inactive → escalates to the next ancestor; targets ≠ career thresholds (separate labels).
- `r1/p3/dashboards` — four role dashboards (§7.3) built from `SECURITY INVOKER` views/RPCs so RLS applies. Actuals come only from `eligible` production and completed activities (§14.5: no double counting).
- `r1/p3/career-progress` — the §7.4 display plus a **career simulator** (TS mirror, clearly labelled as simulation).
- `r1/p3/profiles-coaching` — performance dimensions (§8.1), coaching sessions/actions/notes with `private_manager` vs `shared` visibility (RLS: private notes are visible only to the author and their ancestors, never to finance), review checklist, and rule-based insights (§8.3) worded as prompts, never verdicts (§8.5).
- `r1/p3/forecast` — pace-based forecast labelled "Schätzung", method visible, never written to official tables (§7.5).

### Phase 4 — Leads & tasks · `r1/p4-leads-tasks` (§15 Phase 4)
- `r1/p4/task-engine` (first; shared by everything after it): tasks, reminders, escalation, recurrence, notification centre, preferences.
  Critical notifications can't be muted (§11.3). pg_cron produces system tasks (§11.2 triggers).
  **Edge cases**: owner deactivated → reassign to manager; DST shifts for reminder times; duplicate system tasks (unique `(source, source_ref, due_date)`).
- `r1/p4/activities` — calls/emails/appointments shared by leads and customers; appointment states booked/held/no-show/cancelled.
- `r1/p4/leads` — configurable stages (§9.2) with required fields per stage; assignment and reassignment with a mandatory reason (§9.3); SLA in business hours using `business_calendar` (Bundesland holidays; SLA value configurable, never hard-coded);
  duplicate detection before create using `pg_trgm` on normalised name + exact phone (E.164) + email (§9.5); merge only by an authorised user, with audit; lead → customer conversion keeps the links (§14.5).
  **Edge cases**: a lead with no contact data; a reassigned lead with an open appointment; stage skipping (allowed only if the stage config allows it); won without linked production (allowed, flagged); importing leads with consent fields missing.
- `r1/p4/lead-analytics` — funnel and conversions with an explicit denominator and window (§8.2, §17.5); cost per lead/sale only when the source cost exists.

### Phase 5 — Customer CRM · `r1/p5-crm` (§15 Phase 5)
- `r1/p5/customers` — profile (§10.1), adviser + structure association, hierarchy-scoped RLS (provisional per **OD-13**: adviser = own; leaders = descendants'; no broader read).
- `r1/p5/consent` — `customer_consents` (purpose, legal basis, evidence, withdrawal), communication preferences, opt-out. Any consent change is audited.
- `r1/p5/contract-links` — `contract_links` + a read-only sync adapter Edge Function (blocked by **OD-14**: portal identity/API). Stable external IDs, `sync_runs`/`sync_errors`, failed payload **metadata only** (§11.2). No scraping (§10.4).
- `r1/p5/service-reminders` — tasks from confirmed dates only (§10.3).
- `r1/p5/privacy-ops` — data subject access export, rectification, erasure (pseudonymise PII and keep financial records), and retention jobs (**OD-16** retention periods).
- **Gate D** before any live customer import: RLS + audit tests for all CRM tables green, plus external review.

### Phase 6 — Retention automation & analytics · `r1/p6-automation` (§15 Phase 6)
- `r1/p6/email-templates` — versioned templates, merge fields (whitelisted, HTML-escaped), preview, test send to the requesting user only, approval by a second person (four-eyes).
- `r1/p6/email-engine` — Edge Function sender (provider = **OD-11**). It checks the global kill switch → consent/legal basis → suppression → send window (timezone-aware) **at send time**, not at schedule time.
  Idempotency key `(customer_id, template_id, occasion, occasion_date)`. Every attempt is logged, including suppressed sends with a reason (§14.6). Bounce webhooks update suppressions. **Disabled by default until Gate E.**
  **Edge cases**: 29 Feb birthdays in non-leap years (provisional: 28 Feb); customer opts out between schedule and send; invalid address; provider outage (retry with backoff, no duplicates); template edited after scheduling (sends the approved version referenced by the schedule).
- `r1/p6/advanced-analytics` — lead-source ROI, trend alerts, optional auto-assignment (§9.3), each behind a flag.

---

## 7. Cross-module edge-case checklist (review on every PR)
- [ ] Effective-dated: does a back-dated change touch a locked period? → reject or exception queue, never silent.
- [ ] Inactive employee as owner, manager, recipient or approver?
- [ ] Self-approval or approval by a non-ancestor blocked?
- [ ] Concurrent edits: is the optimistic `updated_at` check or row lock in place?
- [ ] Idempotent when the action/trigger/cron runs twice?
- [ ] Rounding only at the documented points; are totals reproducible from the rows?
- [ ] Timezone: business dates in Europe/Berlin; DST around reminders and send windows?
- [ ] RLS tests for anon / peer / manager / ancestor-of-manager / finance / compliance / admin-aal1 / admin-aal2?
- [ ] Audit event with a reason for every sensitive change?
- [ ] Vault isolation: does the change keep the private vault invisible to everyone but its owner?
- [ ] Provisional rule used? → `OD` ID referenced in code, UI notice shown, register updated.

---

## 8. Delivery gates (§15) mapped to merges
| Gate | Condition | Unlocks |
|---|---|---|
| A | Profina signs off the rules + answers OD-01…OD-08 | Start of Phase 2; provisional notices removed for answered items |
| B | Vitest + pgTAP golden cases green for points, AE, periods, KV, cap, reserve, differential | Merge Phase 1 (+2) into `main` |
| C | ≥ 10 real cases reconciled against manual calculations | Commission visible to users in production |
| D | RLS + audit test suite green; external access review | Import of live customer data (Phase 5) |
| E | Templates, legal basis, suppression and approvals verified | Turning on the email kill switch |
| F | Pilot with selected users | Organisation-wide rollout |

---

## 9. Open decisions register (each blocks or flags code)
| ID | Topic (§16) | Provisional implementation | Blocks |
|---|---|---|---|
| OD-01 | Career period boundaries & timezone | `[start, end)` dates, Europe/Berlin | p1/career-engine |
| OD-02 | Transition period; carry-over of unused/surplus points | Separate `transition` period; no carry-over | p1/career-engine |
| OD-03 | KV counted in total? KV check before/after cap? | KV counts in total; check after cap, proportional | p1/career-engine |
| OD-04 | What is "one structure"; cap from which level | Each direct report's subtree; cap when target ≥ OL | p1/career-engine |
| OD-05 | Full differential rate matrix & attribution | Rate-compression walk (see section 6, p2/rate-matrix) | p2 (Gate A) |
| OD-06 | LV term > 35 years | Formula uses min(term, 35); actual term stored | p1/production |
| OD-07 | Point/AE precision & display | 4 dp stored, 2 dp shown, AE integer shown | all |
| OD-08 | Eligibility milestone (submitted/issued/paid) | Manual status `eligible` set by authorised user | p1/production, p2 |
| OD-09 | Subsidy prorating/pausing/reclaim, approver | Manual approved amount; admin/finance approve | p2/subsidy |
| OD-10 | Reserve release/clawback | Withheld only; release/clawback manual, audited | p2/ledger |
| OD-11 | Email provider (EU hosting, DPA) | none — engine disabled | p6 |
| OD-12 | Which rule version applies (production vs approval date) | Production date | p1, p2 |
| OD-13 | Customer visibility scope | Own + descendants | p5 |
| OD-14 | Contract portal identity & integration path | Manual `contract_links` only | p5/contract-links |
| OD-15 | Promotion: automatic or approved | Approved by admin from the "ready" queue | p1/career-engine |
| OD-16 | Retention periods per data class | None deleted automatically | p5/privacy-ops |
| OD-17 | May leaders see descendants' commission amounts | Off by default (`app_settings`) | p2/finance-ui |
| OD-18 | Remuneration for Strom/Gas/Kfz | Out of scope; 0 P / 0 AE | — |

---

## 10. Verification strategy
- **Unit (Vitest)**: `src/domain/*` at 100% branch coverage on calculation files; zod schemas; hooks with a mocked Supabase client.
- **Database (pgTAP, `supabase test db`)**: every golden case; every RLS role matrix; append-only guards; locked-period guards; idempotency (call twice → same rows); cycle prevention; cron functions run directly.
- **Parity**: `scripts/check-golden-parity.ts`, where TS and SQL golden case IDs must match.
- **Integration (later, Playwright)**: invite → accept → MFA → enter production → see points → leader sees team → finance approves a statement.
- **Performance**: synthetic 5k employees / 200k production records; RLS-scoped dashboard RPCs < 300 ms p95 on staging.
- **Security**: Supabase Security Advisor clean after every migration; a `role_table_grants` query like the one in `check.md` shows no anon grants and no `authenticated` writes on computed tables; the CSP check from `check.md` §6 is re-run after each deploy.
- **Manual per phase**: run on staging with the seed personas (FA, FB, TL, OL, DL, RL, VD, finance, compliance, admin, vault-only).

## 11. Suggested order & rough size
| Order | Branch | Size |
|---|---|---|
| 1 | p0/tooling → p0/ui-kit → p0/app-shell | M |
| 2 | p1/audit → p1/identity-roles → p1/hierarchy → p1/rules-config → p1/production → p1/career-engine | XL |
| 3 | Gate A/B | — |
| 4 | p2/rate-matrix → p2/ledger → p2/statements → p2/subsidy → p2/finance-ui → Gate C | L |
| 5 | p4/task-engine (can start in parallel with p2, since it only needs p1/identity + hierarchy) | M |
| 6 | p3/* | L |
| 7 | p4/activities → p4/leads → p4/lead-analytics | L |
| 8 | p5/* → Gate D | L |
| 9 | p6/* → Gate E → F | M |
