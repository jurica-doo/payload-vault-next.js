# r1/p0/app-shell — Sales section, feature flags, permissions

| | |
|---|---|
| Branch | `r1/p0/app-shell` → merged into `r1/p0-groundwork` |
| Plan section | IMPLEMENTATION_PLAN.md §1 (principles 6, 7), §4.2, §5.2, §6 Phase 0 · `r1/p0/app-shell` |
| Status | Done; 141 unit tests and 38 DB assertions green; build OK |
| Date | 2026-10-26 |

## What was done

### Database — migration `20261026130000_app_shell_context.sql`
- **`app_private` schema**: the home for `SECURITY DEFINER` helpers from Phase 1 on. `anon` and `authenticated` get no `USAGE`, so nothing in it can be called as an RPC.
- **`public.app_settings`** (key/value, RLS on, **no grants for anon/authenticated**). The first row, `feature_flags`, has every module switched **off**:
  `sales, production, career, team, commission, goals, leads, customers, tasks, admin`.
  Keys must be lowercase snake_case (CHECK constraint).
- **`public.rpc_my_context()`**: one JSON object describing the signed-in user:
  ```json
  { "user_id": "…", "aal": "aal1|aal2", "employee": null, "roles": [],
    "descendant_count": 0, "feature_flags": { "sales": false, … } }
  ```
  `SECURITY DEFINER`, `search_path = ''`; EXECUTE for `authenticated` only; returns NULL without a user.
  `employee`, `roles` and `descendant_count` are placeholders: **`r1/p1/identity-roles` replaces the function** with the real lookups, keeping the same JSON shape so the frontend doesn't change.
- Types regenerated (`npm run types`).

### Frontend
| File | What |
|---|---|
| `src/data/salesModules.ts` | **Module registry**: key (= flag), label, route, audience (`employee` / `leader` / `admin` / `finance`), phase, description. `moduleForPath()` picks the most specific route. Navigation, layout, titles and access checks all read from here. |
| `src/hooks/permissions/permissions.ts` | `derivePermissions(ctx)` turns the RPC JSON into booleans, **failing closed** on anything malformed. `canSeeModule()` = master flag `sales` **and** the module's flag **and** a matching audience. |
| `src/hooks/permissions/usePermissions.ts` | One cached `rpc_my_context` query per user (5 min stale time). While loading or on error the user has **no** sales permissions. |
| `src/components/layout/SalesShell.tsx` | Layout for `/vertrieb/*` and `/admin/*`: header without the vault's year filter, module tabs, and a gate. Disabled, forbidden and unknown routes all show the **same** neutral "nicht freigeschaltet" page, so the UI doesn't reveal which modules exist. |
| `app/vertrieb/**`, `app/admin/**` | Routes for every module: `/vertrieb`, `/produktion`, `/karriere`, `/team`, `/provisionen`, `/ziele`, `/leads`, `/aufgaben`, `/kunden`, `/admin`. Each shows a `ModulePlaceholder` until its slice is built. |
| `NavigationDropdown.tsx` | Visible sales modules are appended after the vault links. The active state uses the most specific module, so "Vertrieb" isn't highlighted on `/vertrieb/produktion`. |
| `HeaderHome.tsx` | New `showYearSelector` prop (default `true`, so vault pages are unchanged). |
| `useRegisterSW.ts` | **No service worker in development**, and a worker left over from an earlier dev session is unregistered and its caches cleared. This fixes the stale-code problem found in `r1/p0/ui-kit`. Production behaviour is unchanged. |

### What users see right now
Nothing changes: all flags are off, so the navigation shows only the vault, and `/vertrieb/*` shows "nicht freigeschaltet". **This holds even after the migration is applied to production.**
Until it's applied, `rpc_my_context` doesn't exist in production, the query errors, and the shell fails closed with the same page. The vault keeps working in both cases.

## How to verify
```bash
npm test             # 141 tests
npm run test:db      # 000_baseline (24) + 010_app_shell (14)
npm run typecheck    # if it complains about .next/types after adding routes: npx next typegen
npm run build
```
Manual:
1. Signed out, open `/vertrieb/produktion`: you're redirected to `/login?from=%2Fvertrieb%2Fproduktion`. ✔ checked.
2. In development, DevTools → Application → Service workers lists nothing after one reload. ✔ checked (0 registrations).
3. Signed in, with all flags off: no "Vertrieb" links in the menu, and `/vertrieb` says "nicht freigeschaltet". *Not checked here* (needs a login, and the local `.env` points to a local Supabase that isn't running).
4. To preview modules on **staging only**, as admin in the SQL editor:
   ```sql
   update public.app_settings
      set value = value || '{"sales": true, "production": true}'::jsonb, updated_at = now()
    where key = 'feature_flags';
   ```
   Until `r1/p1/identity-roles` lands, nobody is an "employee", so even then the modules stay hidden. That's correct.

## What to look out for
- **Don't flip flags in production** until the module's gate (plan §8) is signed off. Flags hide UI; access control is still RLS.
- **`rpc_my_context` shape is a contract.** When `identity-roles` replaces it, keep all keys (`user_id`, `aal`, `employee{id, first_name, last_name, status, level_code}`, `roles[]`, `descendant_count`, `feature_flags`). `permissions.test.ts` documents what the frontend relies on.
- **Cache invalidation.** After an admin changes flags or roles, users see the change within 5 minutes or on reload. Mutations that change the current user's roles must invalidate `myContextQueryKey(userId)`.
- **Next route types.** When new route folders are added while an older `.next/types` exists, `tsc` can report `Type '"/vertrieb"' is not assignable to type '"/"'`. Run `npx next typegen`. CI isn't affected (clean checkout).
- **Lint before pushing, and read the summary line.** The first push of this branch failed CI on `@next/next/no-assign-module-variable` (a local variable named `module` in `ModulePlaceholder`). Fixed in a follow-up commit; `npm run lint` must end with `0 errors`.
- `HeaderHome` is still the vault header (logo, theme toggle, profile menu). Sales-specific header content (e.g. a notification bell) comes with `r1/p4/task-engine`.

## Edge cases covered by tests
- **DB**: anon/authenticated have no `USAGE` on `app_private`; no table grants on `app_settings`; all flags ship `false`; invalid setting key rejected; authenticated can't read or update flags directly; anon can't run the RPC; the RPC returns the caller, `aal1`/`aal2` and the full key set.
- **derivePermissions**: `null`/string/number/array input → no permissions; vault-only user (no employee row) sees nothing; `invited`/`inactive` employees aren't employees; leader needs an active employee with a numeric `descendant_count > 0` (`"3"` doesn't count); junk in `roles` is ignored; flags count only when exactly `true` (`"true"` and `1` are ignored).
- **Visibility**: master flag off → nothing; module flag needed too; Team hidden from advisers and shown to leaders; admin area for admins even without an employee row; finance without an employee row sees only Provisionen.
- **moduleForPath**: nested routes map to the most specific module; `/vertriebsleiter` and `/einnahmen` don't match.
- **SalesShell**: allowed page with active tab; flag off → blocked; adviser on `/vertrieb/team` → blocked; unknown route → same neutral page; RPC error → fails closed with a hint; loader while loading; admin area without module tabs.
