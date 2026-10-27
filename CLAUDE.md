@AGENTS.md

# Profina Payload Vault — session primer

Read this first; it replaces a codebase crawl. Facts below were verified in the code (state: 2026-10-27, branch `feat/ux-ui-improvements`). When you change something listed here, update this file.

## 1. What this is
- Business web app (PWA) for **Profina**, a German insurance sales organisation. **Not Payload CMS** — "Payload Vault" is just the product name.
- Two halves:
  - **Vault** (every user): own income documents (commission PDFs, parsed client-side), tax-relevant expenses (photo/PDF → receipt AI edge function), Statistiken, Analysen, tax-report PDF — all per *Geschäftsjahr* (year filter).
  - **Vertrieb** (sales system, feature-flagged per module): Cockpit, Produktion (+CSV import), Karriere, Team (+coaching profile), Provisionen (+Abrechnung for finance), Ziele, Leads (+Auswertung), Aufgaben (+Aktivitäten), Kunden (+Kommunikation, Datenschutz). Plus **/admin = "Verwaltung"** (Mitarbeitende, Hierarchie, Regeln, Beförderungen, Lead-Einstellungen) — built in this repo, same components.
- UI is **German only**, formal **"Sie"**, no i18n library (strings inline). Routes are German (`/einnahmen`, `/vertrieb/kunden`, …). Code, comments, docs are English.
- Spec and plan: `requirements1/` (IMPLEMENTATION_PLAN.md, CHECKLIST.md = everything still open, per-phase docs, spec PDF).

## 2. Stack & commands
- Next.js **16.2** App Router (breaking changes vs. training data — read `node_modules/next/dist/docs/` before using an API), React 19, TypeScript, **Tailwind v4** (CSS-first `@theme` in `src/index.css`, no tailwind.config), TanStack Query v5, Supabase JS v2, zod, decimal.js, recharts, jsPDF, pdfjs-dist, jszip, vanilla-cookieconsent.
- No shadcn/radix/framer-motion/clsx; class strings are template literals; animations are CSS.
- Data access is **browser-only via Supabase**; permissions are enforced in Postgres (RLS + SECURITY DEFINER functions `rpc_*`). No Next API routes or server actions. `proxy.ts` only sets the CSP nonce.

| Command | Does |
|---|---|
| `npm run dev` | dev server on **:5173** |
| `npm run typecheck` / `npm run lint` | tsc / eslint (3 pre-existing warnings are known) |
| `npm test` | vitest (~400 tests) |
| `npm run test:db` | all migrations + pgTAP in a throwaway Docker Postgres (`KEEP_DB=1`, filter arg) |
| `npm run check:golden` | SQL ↔ TS engine parity on golden cases |
| `npm run types` | regenerate DB types |
| `npm run functions` | `supabase functions serve` (uses `--env-file .env.local` — the repo only has `.env`!) |
| `npx next build` | prod build; safe while dev runs (dev uses `.next/dev`) |

CI (`.github/workflows/ci.yml`): lint → typecheck → test → check:golden → build, then migrations + pgTAP.

## 3. Local development
- Supabase local stack uses **own ports 553xx** (another project on the machine uses 543xx): API/Kong **:55321**, DB **:55322**, Studio **:55323**, Inbucket (mail) **:55324**. Containers are named `supabase_*_payload-vault`; `psql` isn't installed — use `docker exec supabase_db_payload-vault psql -U postgres`.
- Env in **`.env`**: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`, anon key, service role key, `GOOGLE_API_KEY` (receipt AI), `NEXT_PUBLIC_ALLOWED_EMAILS` (signup allowlist). Never print secrets.
- Accounts are **invite-only**: `invite-employee` creates the auth user **without a password**; the user sets it on `/update-passwort` via the mail in Inbucket (links expire after ~1 h). An invited-but-unaccepted user cannot log in ("invalid credentials"). Fix: set password + confirm in Studio, or re-invite / "Passwort vergessen".
- Auth URLs point at `http://localhost:5173` (`supabase/config.toml`). TOTP MFA is enabled locally.
- Browser checks: use Claude in Chrome against localhost:5173. Never type the user's real credentials — ask them to sign in.

## 4. Repo map
```
app/                      thin page.tsx wrappers → src/views; layouts mount the shells
  (dashboard)/            einnahmen + steuerrelevante-ausgaben → DashboardShell
  vertrieb/, admin/       → SalesShell        profil/ → ProfileShell
  page.tsx, statistiken/, analysen/ → views render <AppShell> themselves
  layout.tsx              html lang=de, Inter (next/font), inline theme script (CSP nonce)
  providers.tsx           Auth → QueryClient → Year → Banner(toasts) → Modal; NavigationProgress, PWA prompts, cookie consent
  error.tsx, global-error.tsx, not-found.tsx, */loading.tsx (inside shell segments only)
src/views/<area>/         screens (one folder per feature); tests next to them
src/components/<name>/    UI kit, one folder each (X.tsx, X.const.ts, X.types.ts)
src/hooks/<useDomain>/    React Query hooks per domain (useLeads, useCustomers, usePdf, useExpenses, …)
src/domain/               pure business logic (points, commission, career, sla, forecast…) mirrored 1:1 by SQL; golden-tested
src/data/                 navigation.ts, salesModules.ts, pageMeta.ts, routes.ts
src/utils/                dbErrors.ts, authErrors.ts, format.ts (German numbers/dates), theme.ts, csvExport.ts, safeRedirect.ts, taxReport/
src/context/              AuthContext, ProtectedRoutes, banner/, modal/, YearContext, title/TitleContext, BulkSelectContext
src/lib/                  supabase.ts (client), pdf/ (PDF text extraction)
supabase/migrations/      44 migrations (timestamped); supabase/tests/ pgTAP; supabase/functions/ (4 edge functions)
requirements1/            plan, CHECKLIST.md, phase docs
check.md                  local-only security notes (git-excluded) — don't commit
```

## 5. App shell, navigation, routing
- **`src/components/layout/AppShell.tsx`** = sidebar (`Sidebar.tsx`, collapsible rail on lg, drawer below) + top bar (`header/HeaderHome.tsx`: title, back link, `actions` slot, year filter, user menu `MenuDropdown.tsx` with theme switch System/Hell/Dunkel). Content keyed by pathname (`page-enter` fade).
- Shells: `DashboardShell` (vault; year filter; upload button `pdfImport/PdfImportFooter` / `ExpensePdfImportFooter` in the top bar, floating on mobile), `SalesShell` (module gate → "nicht freigeschaltet" EmptyState; renders `PageHeader` from **`src/data/pageMeta.ts`** with `PageActionsSlot`; NotificationBell), `ProfileShell`.
- **`src/data/navigation.ts`**: grouped sidebar (Mein Tresor / Vertrieb / Kunden & Leads / Verwaltung). Items reference a module key + optional `visible(perms)`; sub-items show under the active parent. `activeNavHref`, `parentNavHref` (back link).
- **`src/data/salesModules.ts`**: module registry (key, label, href, audience, flag). Flags live in DB `app_settings.feature_flags`. Access: `usePermissions()` (`hooks/permissions`) + `canSeeModule`.
- **`src/data/routes.ts`**: `ROUTE_PATTERNS` (every page), `isKnownRoute`, `nearestParentRoute`. **Adding a page ⇒ add it here**; `routes.test.ts` checks the list against `app/`, and that every nav item, breadcrumb, back link and literal `href`/`router.push` points at an existing page.
- New sales/admin page ⇒ also add an entry in `pageMeta.ts` (title, description, breadcrumbs) and, if it belongs in the sidebar, `navigation.ts`.
- Primary page CTA: wrap it in `<PageActions>` (portal into the page header). One dominant primary action per screen.
- Loading feedback: `NavigationProgress` (top bar on link clicks/back-forward), sidebar pending spinner via `useLinkStatus` (Next 16), route `loading.tsx` in shell segments.
- Auth guard: `context/ProtectedRoutes.tsx` → `/login?from=…`; always sanitize with `safeInternalPath`.

## 6. Design system
- Tokens in **`src/index.css`** `:root` (light, base) and `:root[data-theme="dark"]`; `@theme` exposes them with a doubled prefix: `bg-color-bg-card`, `text-color-text-subtle`, `border-color-border-strong`, `bg-color-primary`, `text-color-on-primary`, `shadow-shadow-soft` (includes a hairline ring), `rounded-radius-lg`… **Never hardcode hex** in components.
- Palette: slate neutrals; Profina teal primary (`--color-primary` #00857a light / #22c3b4 dark, AA with on-primary); gold secondary used sparingly; status tones success/error/warning/info each with `-text` and `bg-*-subtle`.
- `data-theme` is always resolved to light/dark; preference handling in `src/utils/theme.ts` (system default, localStorage `theme`); the pre-paint script in `app/layout.tsx` must keep `nonce` + `suppressHydrationWarning`.
- Shared classes: `ui-card`, `ui-input`, `ui-label`, `ui-link-button`, `interactive-card` (hover lift), `pressable`, `skeleton` (shimmer), `stagger`, `tabular`, animations `animate-fade-in|scale-in|slide-up|slide-down|sheet-up|pop-in|draw-check`, `page-enter`. `prefers-reduced-motion` disables motion globally. Native inputs/selects/checkboxes get base styling automatically.
- Typography: Inter, body 15 px, deliberately small headings (page h1 ≈ 24–26 px). Use `PageHeader`/`SectionHeading` instead of ad-hoc h1/h2. German text hyphenates in p/td/li only.
- Charts: categorical colours `var(--chart-1…8)` (validated for CVD per theme in `index.css`); never cycle past 8 (`--chart-other`); don't use status red/green as a series; tooltip/axes use text tokens.
- Showcase of every component/state: **`/dev/ui`** (`src/views/devUi/DevUiPage.tsx`, 404 in production).

## 7. Component kit — reuse, don't hand-roll
| Need | Use (src/components/…) |
|---|---|
| Buttons | `button/Button` (variants primary · secondary · ghost · approve · decline · danger; sizes small/medium/large; `icon`, `isLoading`, `fullWidth`, `className`), `button/ButtonLink` (Link styled as button), `iconButton/IconButton` (needs `label`) |
| Overflow row actions | `actionMenu/ActionMenu` (items with icon/danger/hidden/disabled; one visible primary action per row, rest here) |
| Cards & sections | `card/Card`, `card/SectionCard`; class constants in `card/card.const.ts` (`cardClass`, `inputClass`, `rowActionClass`) |
| Page layout | `pageHeader/PageHeader` (+`PageActions`), `sectionHeading/SectionHeading`, `linkCard/LinkCard`, `detailLayout/DetailLayout` + `RecordHeader` (record pages: work column + sticky facts aside), `documentToolbar/DocumentToolbar` (search + filters + Exportieren menu + Auswählen) |
| Tabs / toggles | `tabs/Tabs` (segmented or underline, arrow keys), `segmentedToggle/SegmentedToggle` |
| Forms | `field/Field`, `inputField/InputField`, `formFields/FormFields` (CurrencyInput/DateInput/TextArea, `parseGermanDecimal`), `passwordInput/PasswordInput`, `dropdown/Dropdown`, `searchBar/SearchBar`, `periodSelector/PeriodSelector`, `reasonConfirm/ReasonConfirmForm` |
| Tables & data | `dataTable/DataTable` (sorting, pagination, skeleton/error/empty, mobile cards; `hideOnMobile`), `statusBadge/StatusBadge` + `StatusMap`, `kpiTile/KpiTile`, `progressMeter/ProgressMeter`, `stageStepper/StageStepper`, `values/Values` (MoneyValue/PointsValue/AeValue), `charts/*` |
| Dialogs | `useModal().openModal({ title, size, children })` → `modal/Modal` (Escape, focus trap, mobile sheet); footer `modal/ModalActions`; confirmations `modal/ConfirmDialog` |
| Feedback | toasts `useBanner().showBanner(title, description, "success"\|"error"\|"info"\|"warning")` (stack of 3); `hooks/useErrorToast` for `mutate(…, { onError })`; `notice/Notice` (callouts; `MfaRequiredNotice`, `ProvisionalRuleNotice` use it); `emptyState/EmptyState`; `errorBlock/ErrorBlock` (`variant="page"\|"inline"`, `onRetry`); `loadingState/LoadingState`, `skeletonLoader/*` |
| Icons | `icons/index.tsx`; outline UI icons in `icons/LineIcons.tsx` (`size` prop). Some old filled icons ignore `size` → also pass `className="h-4 w-4"` |

Patterns: toast titles name what failed ("Löschen fehlgeschlagen"), never just "Fehler"; destructive actions go through `ConfirmDialog`; success moments get a toast; loading uses skeletons, not "Lädt…" text.

## 8. Errors & user-facing messages
- DB functions raise **snake_case machine keys** (`forbidden`, `mfa_required`, `period_locked`, …; SQLSTATE says the kind). Edge functions return `{ error: "<key>", code: "<key>" }`.
- **`src/utils/dbErrors.ts`** maps keys → German, plus SQLSTATE fallbacks (23505, 23514, 23P01, 23503, 42501/RLS, 22xxx, 40001, 57014, PGRST3xx), network errors and Storage rejections. Unknown → `GENERIC_ERROR`. Raw DB/English text is never shown.
- Hooks: `if (error) throwDbError(error)` → throws **`UserFacingError`** (already German). Own German errors: `new UserFacingError("…")`.
- Views: show **`errorText(e[, fallback])`** — never `e.message`, never `""`. Query errors into `DataTable error=` / `EmptyState hint=` / `ErrorBlock` also via `errorText`.
- Auth (login, reset, update password, signup, MFA): **`src/utils/authErrors.ts` `authErrorMessage(err, "login"|"reset"|"update"|"signup"|"mfa"|"mfa_code")`** (by Supabase `AuthError.code`; login never reveals whether an account exists).
- **New DB/edge error key ⇒ add German text in `dbErrors.ts`**; `src/utils/dbErrors.test.ts` scans migrations and edge functions and fails otherwise.

## 9. Data, roles, rules
- Supabase client `src/lib/supabase.ts`; context RPC gives `Permissions` (`hooks/permissions/permissions.ts`): `employeeId`, `isEmployee`, `isLeader` (has descendants), `isAdmin`, `isFinance`, `isCompliance`, `hasMfa`, `flags`.
- **MFA (aal2) required** for admin/finance writes (DB enforces; UI shows `MfaRequiredNotice`, setup at `/profil/sicherheit`).
- Audit log is append-only; sensitive actions need a reason (`reason_required`, ≥10 chars) → `ReasonConfirmForm`.
- Numbers depending on unconfirmed business rules show `ProvisionalRuleNotice` (decision IDs `OD-xx`). Never label amounts "netto"/"Auszahlung".
- Money/points: decimal.js; format with `utils/format.ts` (German locale, `formatPercent`, `safeRatio`, "–" for zero denominators).
- Business logic lives twice (SQL + `src/domain`) — change both and keep `check:golden` green.

## 10. Testing conventions
- Vitest + jsdom + Testing Library; `*.test.ts(x)` next to the code (`vitest.config.mts` includes `src/**` and `scripts/**`).
- View tests `vi.mock` the data hooks and `usePermissions`. If a view uses toasts or `useErrorToast`, mock `context/banner/BannerContext` (`useBanner: () => ({ showBanner: vi.fn() })`).
- Mocked mutations should reject with `UserFacingError` (that's what hooks throw).
- `SalesShell.test.tsx` mocks `HeaderHome` and asserts nav links via the real Sidebar (`aria-current="page"`).
- DB: pgTAP files in `supabase/tests/*.test.sql`, run by `npm run test:db` (Docker, no Supabase CLI needed).

## 11. Gotchas
- Next 16: error boundaries receive **`unstable_retry`** (not `reset`); `global-error.tsx` must render `<html>`; `useLinkStatus` must be inside a `<Link>`; a root `loading.tsx` would replace the shell — keep loading files inside shell segments.
- CSP (`proxy.ts`): inline scripts need the nonce; `font-src 'self' data:` (fonts must be self-hosted — next/font does it).
- Nothing with `transform`/`backdrop-filter` around fixed children (the mobile upload button lives in the header).
- Logos swap via `.theme-logo-dark` / `.theme-logo-light` classes.
- Key maps use `Object.hasOwn` (avoid inherited keys like `toString`).
- `ContentCard` `onDelete` may return a promise; pass `mutateAsync` so the delete dialog reports real failures.
- Old copies still exist in places: prefer the kit components above when touching a view.

## 12. Status & open items
- Branches: `main` (prod), `feat/requirements1` (all phase work, merged slices), **`feat/ux-ui-improvements`** (redesign + error messages + navigation; based on requirements1; **not pushed** as of 2026-10-27).
- `extract-data-from-expense-image` with the new error keys is already deployed to production (project ref `mitvsxswoagzixcbrhia`, 2026-10-27).
- Still open (see `requirements1/CHECKLIST.md`): staging project, migrations to prod, Profina decisions (OD-xx), manual signed-in test pass at 360 px, retire `/signup`, finance/admin dashboard decision, security review (Gate D), email sending (off).
- Feature flags for all sales modules are **off** by default; email sending is off.

## 13. Working agreements (learned)
- Plan big changes first; one commit per logical step; commit messages end with the `Co-Authored-By` line from the system reminder. Commit/push only when asked; branch before working on `main`.
- Build reusable components wherever a pattern repeats (the user asked explicitly).
- After UI work: typecheck, tests, lint, build, then look at it in the browser (light + dark).
- Keep German copy formal ("Sie"), specific ("what happened + what to do"), and consistent.
