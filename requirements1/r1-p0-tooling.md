# r1/p0/tooling — Test & CI groundwork

| | |
|---|---|
| Branch | `r1/p0/tooling` → merged into `r1/p0-groundwork` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 0 · `r1/p0/tooling` |
| Status | Done, all checks green locally |
| Date | 2026-10-26 |

## What was done

### Unit tests (Vitest)
- Installed `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react|dom|jest-dom`, `@vitest/coverage-v8`, following Next's own guide (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`).
- `vitest.config.mts`: jsdom environment, `@/` alias through Vite's native `resolve.tsconfigPaths` (no extra plugin), coverage scoped to `src/domain`, `src/utils` and `src/components`.
- `vitest.setup.ts`: jest-dom matchers plus cleanup after each test.
- First real tests cover the two existing security helpers:
  - `src/utils/safeRedirect.test.ts`: open-redirect cases (`//evil`, `/\evil`, `javascript:`, control characters, relative paths).
  - `src/utils/csvExport.test.ts`: formula injection (`= + - @ \t`), quoting, control-character stripping.

### Database tests (pgTAP) without the Supabase CLI
The Supabase CLI binary from npm is ad-hoc signed and gets killed by this macOS version (exit 137), so the CLI-based `supabase test db` can't run. Instead:
- `scripts/db-test.sh` starts a throwaway `supabase/postgres:17.11.0.007` container (the same Postgres 17 the project uses), applies **every real migration in order**, records them in `supabase_migrations.schema_migrations`, loads `supabase/seed.sql` if it exists, then runs every `supabase/tests/*.test.sql` file.
  - The script fails on any migration error, any `not ok`, or any SQL error inside a test file.
  - `KEEP_DB=1` leaves the database running on `localhost:54329` (user `postgres`, password `postgres`) for poking around.
  - `npm run test:db -- 000_` runs only the matching test files.
  - `SKIP_TESTS=1` builds the schema only.
- `supabase/tests/_harness/bootstrap.sql` fills the gaps between the plain image and a hosted project. **It is kept minimal so tests don't lie**:
  - current hosted definitions of `auth.uid()`, `auth.role()` and `auth.jwt()` (they read `request.jwt.claims`; the image ships an older version that reads a single claim)
  - stub `storage.buckets` / `storage.objects` / `storage.foldername()`, only what our bucket migrations use
  - the `supabase_migrations` table
- `supabase/tests/_harness/helpers.sql` adds a `tests` schema:
  - `tests.create_user(email)` passes the real signup trigger rather than disabling it
  - `tests.authenticate_as(user_id, aal)`, `tests.authenticate_as_anon()`, `tests.authenticate_as_service_role()`, `tests.clear_authentication()`
- `supabase/tests/000_baseline_security.test.sql` has 24 assertions. They turn this morning's manual production checks from `check.md` into permanent regression tests:
  - vault tables (`expenses`, `pdf_records`, `budget_targets`, `income_goals`) are visible and changeable **only by their owner**. A peer's SELECT returns 0 rows, a peer's INSERT for someone else is refused, and a peer's UPDATE/DELETE affects nothing.
  - anon has no table privileges at all
  - `authenticated` has no privileges on `signup_allowlist` / `edge_rate_limits`
  - function EXECUTE matrix for `consume_rate_limit` and `get_user_report_years`
  - the allowlist trigger rejects an uninvited email and accepts an invited one regardless of case
  - `consume_rate_limit` returns `TTTTTTTTTTF` for 11 calls, and an empty key fails closed

### Type generation without the CLI
- `npm run types` now runs `scripts/gen-types.sh`. It builds the schema with the harness and asks `supabase/postgres-meta:v0.99.0` (the service the CLI uses internally) for the TypeScript types.
- Running it showed that **`src/types/supabase.ts` was stale**: `edge_rate_limits`, `signup_allowlist` and `consume_rate_limit` from the September security migrations were missing. It's regenerated now. The rest of the diff is formatting (parentheses in generic helpers).
  Note: types list every table in `public`, including ones the browser can't access. Types are not permissions.

### Golden-case parity
- `scripts/goldenParity.mts` + `scripts/check-golden-parity.mts` (`npm run check:golden`): every calculation case gets an ID like `GC-POINTS-001` that must appear in **both** a Vitest file under `src/domain` and a pgTAP file under `supabase/tests`. An ID on only one side fails CI. There are 0 shared IDs today; the first ones arrive with `r1/p1/production`.
- Unit-tested in `scripts/goldenParity.test.ts`.

### CI
`.github/workflows/ci.yml` runs on PRs and on pushes to `main`, `feat/requirements1` and `r1/**`:
- **app** job: `npm ci` → lint → typecheck → unit tests → golden parity → `next build`. It uses placeholder `NEXT_PUBLIC_*` values, and nothing talks to a real project.
- **db** job: `bash scripts/db-test.sh` (GitHub runners have Docker).

### Other changes
| File | Change | Why |
|---|---|---|
| `package.json` | scripts `typecheck`, `test`, `test:watch`, `test:coverage`, `test:db`, `check:golden`; `types` rewired | one entry point per check |
| `package.json` | `decimal.js` dependency | for the financial maths in `src/domain` (Phase 1) |
| `package.json` | `@types/node` 20 → 24 | Vitest 5 needs ≥ 22; the runtime is already Node 24 |
| `tsconfig.json` | `allowImportingTsExtensions: true` | lets the `.mts` scripts run directly with Node's type stripping (safe because `noEmit` is already on) |

## How to verify
```bash
npm run lint          # 0 errors (5 pre-existing warnings)
npm run typecheck
npm test              # 28 tests
npm run check:golden  # "Golden parity OK (0 shared case IDs)"
npm run test:db       # 17 migrations, 1 file, 24 assertions
npm run types         # should leave src/types/supabase.ts unchanged
npm run build
```
Docker Desktop must be running for `test:db` and `types`.

## What to look out for
- **The harness is not hosted Supabase.** No GoTrue, no Storage API, no PostgREST. Tests check database behaviour: RLS, grants, triggers and functions. Anything that depends on the API layer (for example storage upload size limits enforced by the Storage service) still needs a manual check on staging.
- **Bootstrap drift.** If Supabase changes `auth.uid()` / `auth.jwt()` on hosted projects, update `bootstrap.sql` to match, or tests could pass on behaviour production doesn't have.
- **`tests.create_user` knows about the signup gate.** When `r1/p1/identity-roles` replaces the allowlist with employee invites, update this helper in the same PR (it currently inserts into `signup_allowlist` first).
- **Image tags are pinned** (`supabase/postgres:17.11.0.007`, `postgres-meta:v0.99.0`). Bump them deliberately, ideally to the version the hosted project runs.
- The first `test:db` run pulls about 1 GB of images; after that it takes about 15–25 s.
- The CI workflow hasn't run on GitHub yet; it runs on the first push of a branch that contains it. If the `db` job fails there but passes locally, it's most likely the `host.docker.internal` / port mapping (only used by `gen-types.sh`, which CI doesn't run).

## Edge cases covered by tests
- Redirect: protocol-relative, backslash, control characters, scheme URLs, relative paths, empty/null.
- CSV: every formula-trigger character, embedded quotes, separators, newlines, NUL.
- RLS: owner vs peer for SELECT, INSERT, UPDATE and DELETE; anon refused.
- Allowlist: mixed-case email accepted, unknown email rejected.
- Rate limiter: exact boundary (10th allowed, 11th refused), empty key.

## Not done here (planned later)
- `supabase/seed.sql` with synthetic personas: needs the `employees` and `career_levels` tables, so it moves to `r1/p1/identity-roles` and `r1/p1/rules-config`.
- Staging Supabase project: has to be created by an account owner (dashboard). Until then, the integration branch is only tested in the harness.
