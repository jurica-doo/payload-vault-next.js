# End-to-end tests (Playwright)

Browser tests against the local app and the local Supabase stack. The suite grows phase by phase
(`e2e/tests/phaseN-*.spec.ts`), together with the data it needs (`e2e/fixtures/phaseN.mts`,
`e2e/fill/phaseN.mts`).

## Run

```bash
supabase start                 # local stack (ports 553xx)
npm run dev                    # app on :5173 (Playwright starts it if it isn't running)
npm run e2e                    # WIPES the local DB, fills the test data, then runs all tests in Chrome
npm run e2e -- phase1-1        # same, but only the matching test file(s)
npm run e2e:ui                 # same reset + fill, then the interactive runner (watch, step through)
npm run e2e:run -- phase1-4    # tests only, NO reset — re-run against the current data while debugging
npm run e2e:prepare            # reset + fill only (e.g. before a manual test pass)
npx playwright show-report     # HTML report of the last run (screenshots + traces of failures)
```

Every `npm run e2e` starts from a clean database, so a green run means the whole path works from
scratch: migrations, seed, the API fill and every test. The tests change data (they create employees,
approve promotions, …) and build on each other, so `e2e:run` is only for re-running a test while
fixing it — confirm with a full `npm run e2e` afterwards.

`npm run e2e:prepare` does two things:
1. `supabase db reset` — all migrations + the dev seed (`supabase/seeds/local_dev.sql`).
2. `node e2e/fill/index.mts` — creates the test data **through the real API**: the admin enrols
   TOTP, creates employees (invite → account → email confirmation), grants roles, sets levels and
   reporting lines; producers enter production; finance (with TOTP) confirms, cancels and corrects
   it. At the end it checks the stored points and career numbers against the fixtures and fails
   loudly if anything differs.

## Speed and parallelism
- Sessions are injected (`loginAs`): an API sign-in per account, placed in localStorage before the page
  loads, with 2FA already confirmed when `{ aal2: true }`. Only two tests use the real login form and
  2FA page.
- The five spec files run in parallel (5 workers); tests inside a file run in order. **A file must not
  change data that another file asserts on** — e.g. only the career file promotes people, only the
  production file confirms Paula's records. Keep it that way when adding tests, or put dependent tests
  in the same file.
- `e2e/global-setup.ts` requests every page once so the dev server compiles them before the tests.
- Budget: reset + fill ≈ 30–40 s, tests ≈ 30 s.

## Troubleshooting
- **Tests time out while "waiting for navigation to finish"; pages reload endlessly in the browser.**
  The dev server's Turbopack cache is stale (seen after moving the project folder and after
  `npm install` while `npm run dev` was running: "Failed to write app endpoint … Next.js package not
  found"). Stop `npm run dev`, delete `.next/`, start it again.
- **`failed to parse config … invalid keys: local_smtp`**: an old Supabase CLI. The npm scripts use the
  project's pinned CLI — run `npm ci` after pulling.
- **"C3: Selbstregistrierung ist abgeschaltet …" fails (the signup is accepted)**: the running stack
  still uses an older `supabase/config.toml` (`[auth] enable_signup = true`). Auth settings are read
  when the containers start: `supabase stop && supabase start`, then `npm run e2e` again.
- **The fill stops with "Email logins are disabled"**: `[auth.email] enable_signup` is `false`. Despite
  its name it switches the whole e-mail provider off. It must stay `true`; only `[auth] enable_signup`
  blocks signups. Fix it, then `supabase stop && supabase start`.
- A test fails and you want to look at it: `npx playwright show-report` (screenshot + trace), or
  `npm run e2e:run -- <file> --headed` to watch it without resetting.

## Accounts (password `123456` for all)

| Account | Who | Used for |
|---|---|---|
| admin@test.com | Erika Mustermann — admin, TL, **TOTP** | everything in Verwaltung |
| user@test.com | Max Mustermann — FA under Erika | adviser view |
| vault@test.com | no employee record | vault only |
| dl@test.com | Dora Direktor — DL, top of the test structure | sees the whole structure |
| tl@test.com | Tim Teamleiter — TL, target OL | §4.5 structure cap (775 P, ready) |
| fb.a@test.com | Anna Alpha — FB, structure A (800 P / 80 KV-P) | capped structure |
| fa.a@test.com | Ali Alpha — FA under Anna, planned move to Ben on 2027-06-01 | planned transfer |
| fb.b@test.com | Ben Beta — FB, structure B (300 P / 40 KV-P) | exactly at the TL threshold |
| tl2@test.com | Tina Teamleiterin — TL | second structure |
| fa@test.com | Fritz Fleißig — FA, §14.4 FB candidate (100 P, 7 KV-P) | KV minimum |
| punkte@test.com | Paula Punkte — FA, every points rule (§14.1) | points, reversal, correction |
| nolevel@test.com | Nora Ohnestufe — no career level | blocked career state |
| inactive@test.com | Igor Inaktiv — deactivated | lost sales access |
| finance@test.com | Frank Finanz — finance role, **TOTP** | confirming production |
| compliance@test.com | Clara Compliance — compliance role | read-only oversight |
| invited@test.com | Ida Wartend — invited, never accepted (no login) | invite state |

### 2FA codes
Admin and finance actions need a 2FA-confirmed session. The fill script enrols TOTP for the
accounts marked above; their secrets are in `e2e/.auth/state.json` (git-ignored).

```bash
npm run totp                     # current code for every account
npm run totp -- admin@test.com   # one account
```

Enter the code at **Profil → Sicherheit & Zwei-Faktor** (`/profil/sicherheit`). You can also add the
printed key to an authenticator app.

## Layout

```
e2e/
  fixtures/phase1.mts   people, structure, production and expected numbers (single source of truth)
  fill/index.mts        runs every phase's fill in order; fill/phase1.mts = Phase 1
  lib/                  API client (GoTrue + PostgREST), TOTP, psql, saved state
  tests/                Playwright specs (+ helpers.ts: login, 2FA step-up, sidebar, number format)
  totp.mts              the `npm run totp` helper
```

Adding a phase: extend the fixtures, add `fill/phaseN.mts` (call it from `fill/index.mts`), add
`tests/phaseN-*.spec.ts`. Keep expected values in the fixtures so the fill check and the tests
assert the same numbers.
