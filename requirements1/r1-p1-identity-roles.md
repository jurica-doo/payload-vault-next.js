# r1/p1/identity-roles — Employees, invites, roles, MFA

| | |
|---|---|
| Branch | `r1/p1/identity-roles` → merged into `r1/p1-foundation` |
| Plan section | IMPLEMENTATION_PLAN.md §3.1, §4.1–4.3, §6 Phase 1 · `r1/p1/identity-roles`; decision D2 |
| Status | Done; 49 new pgTAP assertions (114 total), 177 unit tests, build OK |
| Date | 2026-10-26 |

## What was done

### Database — `20261026150000_identity_roles.sql`
| Object | Notes |
|---|---|
| `employees` | `employee_no` (auto `P00001` or given), names, email (lowercase, unique), phone (**E.164**), `start_date`, `status invited/active/inactive`, `employment_type`, timezone, `deactivated_at` (required iff inactive), `user_id → auth.users` (`ON DELETE SET NULL`). Audited. |
| `employee_invites` | 7-day invites; **at most one open invite per email** (partial unique index); `linked_at`, `accepted_at`, `revoked_at`. Audited. |
| `user_roles` + enum `app_role` | `admin`, `finance`, `compliance`; revocation keeps history (`revoked_at/by`); one active row per user and role. Audited. "Leader" is **not** a role: it's derived from the hierarchy (next slice). |
| **Signup gate** | `enforce_signup_allowlist` trigger and function **removed**. The new `app_private.enforce_employee_invite` (BEFORE INSERT on `auth.users`) requires a pending, unexpired invite. It keeps the same German error text for every failure, so it can't be used to test addresses. `signup_allowlist` remains as a **deprecated** table (comment set), with no effect. |
| Auth triggers | `link_invited_user` (AFTER INSERT: sets `employees.user_id`, `linked_at`), `activate_on_confirm` (email confirmed → `active`, invite `accepted_at`), `sync_employee_email` (auth email change → employee email, audited with a reason). |
| Policy helpers (`app_private`) | `current_employee_id()` (active employees only), `has_role()`, `is_aal2()`, `can_see_employee()`. `authenticated` gets `USAGE` on `app_private` and `EXECUTE` **only on these four**, because RLS runs them as the caller. Default privileges now revoke EXECUTE on future `app_private` functions. |
| RLS | employees: self, or admin/finance/compliance (the hierarchy slice adds ancestors). Invites: admin only. Roles: own rows, or admin. **No direct INSERT/UPDATE/DELETE** for `authenticated` on any of the three tables. |
| Admin RPCs (all require **admin + aal2**) | `rpc_create_employee`, `rpc_issue_invite`, `rpc_revoke_invite(reason)`, `rpc_update_employee(reason)`, `rpc_set_employee_active(reason)`, `rpc_grant_role(reason)`, `rpc_revoke_role(reason)` |
| `rpc_audit_for(entity_type, id)` | History for one record with the actor's name. Admin/compliance see everything; employees see their own employee record. Extend `app_private.can_read_audit` in later slices. |
| `rpc_my_context()` | Now returns the real `employee` and `roles` (same JSON shape as Phase 0). `level_code` and `descendant_count` stay placeholders until rules-config/hierarchy. |
| `app_private.bootstrap_admin(email)` | First admin, from the SQL editor only. Refuses once any admin exists. |

### Edge Function — `supabase/functions/invite-employee`
POST `{ employee_id }` with the admin's JWT:
1. verify the JWT
2. rate limit (30 per hour per admin, fails closed)
3. call **`rpc_issue_invite` as the caller**, so admin + MFA are checked by the DB
4. `auth.admin.inviteUserByEmail(email, { redirectTo: APP_ORIGIN[0] + "/update-passwort" })`

Errors pass the DB's machine keys through (`forbidden`, `mfa_required`, `already_linked`, …). The code type-checks with `deno check` (Deno 2.9.7 in Docker).

### Frontend
| Path | What |
|---|---|
| `/admin` | Admin home with area cards (more areas get added by later slices). |
| `/admin/mitarbeiter` | Search, table (name/email, personnel number, start, status, roles, actions). Actions: create & invite, resend invite, deactivate/reactivate with a reason, toggle roles with a reason. **Everything is disabled with an explanation when the admin session isn't MFA-confirmed.** You can't deactivate yourself. Expired invites are flagged. |
| `/profil/sicherheit` | TOTP 2FA: set up (QR code plus manual key; abandoned unverified factors are cleaned up first), confirm, or step up an existing session to aal2. Linked from the profile menu ("Zwei-Faktor-Anmeldung"). |
| `src/utils/dbErrors.ts` | DB machine keys → German text; constraint errors get a generic text (raw DB messages are never shown). |
| `src/domain/normalize.ts` | `normalizePhone` (German input → E.164) and `normalizeEmail`, reused later for lead/customer duplicate checks. |
| `src/validation/EmployeeValidation.ts` | zod schema mirroring the DB checks. |
| `src/hooks/useEmployees/useEmployees.ts` | List plus mutations. Invalidates the permission context after role changes. |

### Test harness changes
- `bootstrap.sql` adds the `auth.users` columns hosted projects have but the image lacks (`email_confirmed_at`, …).
- `tests.create_user(email, true)` creates an **active employee through the real invite → link → confirm path**. `tests.create_user(email)` creates a legacy vault-only user, bypassing the gate. New `tests.grant_role`, `tests.employee_id`.
- `000_baseline_security` signup assertions now check the invite gate and that the old allowlist no longer grants signup. `010_app_shell` checks that `authenticated` can't execute non-policy helpers.

## Production rollout (when Phase 1 passes its gate)
Order matters:
1. Apply the migrations up to `20261026150000`.
   - **From then on nobody can sign up without an invite**, including addresses on the old allowlist.
   - Existing accounts keep working: their vault is untouched, and they're "vault-only" until an admin creates an employee record for their email, at which point it's linked automatically.
2. SQL editor: `select app_private.bootstrap_admin('<your email>');`
3. Auth → Providers → Email: switch **"Allow new users to sign up" off** (defence in depth; invites still work).
4. Auth → URL Configuration: add `https://<app>/update-passwort` to the redirect URLs.
5. Auth → MFA: TOTP enabled (default).
6. Deploy `invite-employee`. It needs the secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_ORIGIN`, which are all set already.
7. Log in, set up 2FA at `/profil/sicherheit`, then create the other employees in `/admin/mitarbeiter`.

`NEXT_PUBLIC_ALLOWED_EMAILS` and the `/signup` page are now obsolete. Removing them is part of the later UX pass.

## How to verify
```bash
npm run test:db -- 030      # identity tests
npm test                    # 177
```
On staging (once it exists): the walkthrough above, plus
- invite an address, open the mail, set a password, and check the status changes to "Aktiv"
- try to sign up through `/signup` with an uninvited address: it must be rejected
- as admin without 2FA, every button in `/admin/mitarbeiter` must be disabled
- deactivate an adviser: their `/vertrieb` must show "nicht freigeschaltet" right away (on the next context refresh)

## What to look out for
- **Not clicked through in a browser.** It can't be done locally (no running local Supabase, and the CLI is blocked on this Mac). Covered by pgTAP (DB logic + RLS), the unit tests and the admin page render test. **Needs a manual pass on staging.**
- **Deactivation doesn't end the session**; it removes access. Sales data is blocked immediately by RLS (`current_employee_id()` only returns active employees), but the user can still sign in and use their **own private vault**. Banning the login entirely (`auth.admin.updateUserById(…, { ban_duration })`) is a follow-up if Profina wants it (add an action to the Edge Function).
- **Invite links expire** after Supabase's own setting (Auth → Email → link expiry; default 24 h). Our invite row lasts 7 days, so an expired link plus a valid row is fixed by "Einladung senden" again.
- **Edge function permission errors** come back as HTTP 4xx with the DB key, and the UI maps them. A `502 invite_send_failed` leaves the invite row open, so retrying is safe.
- **`rpc_audit_for` limit**: 200 most recent events per record. Add pagination when a record's history gets longer (e.g. production with many recalculations).
- **Finance/compliance see all employees** (names, contact details). The plan's "assigned scope" for finance isn't modelled yet; revisit with Phase 2.

## Edge cases covered by tests
**Permissions**
- non-admin → `forbidden`
- admin at aal1 → `mfa_required`
- anon → refused

**Creating employees**
- names trimmed; email trimmed and lowercased; personnel number generated
- duplicate email with different case → `employee_exists`
- malformed email, non-E.164 phone, unknown employment type and blank name are all rejected
- an existing vault account is **linked, active, and no invite is created**

**Signup gate and invites**
- invited email passes regardless of case; the auth user gets linked
- status stays `invited` until the email is confirmed, then turns `active` with the invite accepted
- an **expired invite is rejected**
- re-issuing leaves exactly one valid invite and is audited
- no invite for an already-linked employee
- revoking requires a reason

**Deactivation**
- an admin can't deactivate themselves
- deactivation sets the date; the inactive user sees status `inactive` in the context and **sees no employee data**
- reactivation works

**RLS**
- an adviser sees only their own row, no invites and no roles
- direct INSERT/UPDATE are refused
- finance sees all employees but only their own role rows

**Roles**
- the **last admin can't be removed**
- granting twice is idempotent
- granted roles appear in the context

**Audit access**
- you can read your own history
- a peer gets `forbidden` for someone else's

**Bootstrap**
- refused once an admin exists; not executable by `authenticated`

**Frontend**
- phone normalisation (`0170 …`, `+49 (0) …`, `0049 …`, foreign numbers; junk rejected)
- email normalisation; zod schema
- DB error mapping never leaks constraint names
- admin page: expired-invite hint, no self-deactivation, all actions disabled without MFA, roles only for linked accounts
