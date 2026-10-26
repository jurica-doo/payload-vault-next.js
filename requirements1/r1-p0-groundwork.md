# Phase 0 — Groundwork (`r1/p0-groundwork`)

| | |
|---|---|
| Branch | `r1/p0-groundwork` → merged into `feat/requirements1` |
| Slices | `r1/p0/tooling`, `r1/p0/ui-kit`, `r1/p0/app-shell` |
| Status | Done; CI green on GitHub (run 40302297484) |
| Date | 2026-10-26 |

## Summary
| Slice | Result | Details |
|---|---|---|
| tooling | Vitest, a pgTAP harness that runs all migrations in `supabase/postgres:17` without the Supabase CLI, type generation via postgres-meta, golden-case parity check, GitHub Actions CI | [r1-p0-tooling.md](r1-p0-tooling.md) |
| ui-kit | 17 shared components + decimal-safe de-DE formatting + `/dev/ui` showcase (404 in production) | [r1-p0-ui-kit.md](r1-p0-ui-kit.md) |
| app-shell | `app_private` schema, feature flags (all off), `rpc_my_context()`, module registry, permission hook, gated `/vertrieb/*` + `/admin/*` routes, no service worker in development | [r1-p0-app-shell.md](r1-p0-app-shell.md) |

## Numbers at the end of the phase
- 141 unit tests in 12 files
- 2 pgTAP files, 38 assertions, 18 migrations applied cleanly
- `npm run lint`: 0 errors (5 warnings, all from before this work)
- `next build` OK

## Production impact if this were deployed now
- **None visible to users.** All flags are off, and the navigation and vault are unchanged.
- One new migration (`20261026130000`): it adds a schema, one table and one function, and changes no existing objects.
- Service worker: production behaviour is unchanged (only development skips it).
- Per the plan, `feat/requirements1` reaches `main` only at a delivery gate. Nothing from Phase 0 needs to go to production on its own.

## Open items carried forward
1. **Staging Supabase project.** It needs an account owner to create it. Until then, signed-in flows can't be clicked through (the local `.env` points to a local Supabase that the blocked CLI can't start).
2. **Supabase CLI on this Mac.** The npm binary is killed by macOS (exit 137). The test and type scripts work around it; `supabase db push` / `functions deploy` still need a working CLI (e.g. via Homebrew) or the dashboard.
3. **Mobile check** of `/dev/ui` at 360 px in DevTools device mode (the window couldn't be resized from the tooling).

## Next
Phase 1 — `r1/p1-foundation`, starting with `r1/p1/audit`, then `identity-roles`, `hierarchy`, `rules-config`, `production`, `career-engine`.
