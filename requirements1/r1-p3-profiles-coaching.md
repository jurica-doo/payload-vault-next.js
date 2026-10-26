# r1/p3/profiles-coaching — Performance profiles and coaching

| | |
|---|---|
| Branch | `r1/p3/profiles-coaching` → merged into `r1/p3-cockpit` |
| Plan section | IMPLEMENTATION_PLAN.md §3.5, §6 Phase 3 · `r1/p3/profiles-coaching`; spec §8, §12.1–12.2 |
| Status | Done; 27 new pgTAP assertions (478 total), 6 new unit tests (293 total) |
| Date | 2026-10-27 |

## What was done
### Database — `20261027120000_coaching.sql`
| Object | Notes |
|---|---|
| `coaching_sessions` | Date, participants, **summary (visible to the employee)**, next review date; written by a manager (can't be about yourself, not in the future). The summary is redacted in the audit trail. |
| `coaching_actions` | Agreed actions with an owner (employee or leader), due date, and status `open/done/cancelled`. The owner or a manager can change the status. |
| `coaching_notes` | `shared` or **`private_manager`**. **Append-only** (corrections = new note); the text is **redacted in the audit trail**. |
| Visibility | Sessions, actions and shared notes: **the employee and their managers** (today's structure). Private notes: **the author and the author's managers only**, never the employee. **Finance, compliance and admins see no coaching data** (§12.1 "no unnecessary access to coaching notes"; least privilege). |
| `rpc_add_coaching_session(emp, date, summary, participants, next_review, actions[])`, `rpc_set_coaching_action_status`, `rpc_add_coaching_note` | Managers only (owner for their own action status). |
| `rpc_performance_profile(emp)` | Self, managers, admin. 12-month trend (points/KV), product mix (12 months, eligible contracts), last 6 goals with target vs actual, career status, next review date (only for people who may see coaching), and **prompts** (§8.3): `kv_gap` (points reached, KV missing), `declining_trend` (last 3 months < 80 % of the 3 before), `behind_goal` (below 80 % of the pro-rata month target), `overdue_actions`. |

### Frontend
| Path | What |
|---|---|
| `/vertrieb/team/[id]` | Profile: header (level, since, next review), a **"Gesprächsimpulse"** box worded as questions/observations with the note "keine Bewertung" (§8.5), KPIs, 12-month trend, goal history, and coaching (actions with checkboxes, conversations, notes with a "privat" badge). **Managers** also get forms to document a conversation (+ one agreed action + next review) and to add a note (private by default). Malformed ids are rejected before any request. |
| `/vertrieb/team` | Detail panel links to "Profil & Coaching öffnen". |
| `/vertrieb` | **"Vereinbarte Maßnahmen"** box with the employee's own open actions; ticking marks them done (§8.4 "show them on the employee's next dashboard"). |

## How to verify
```bash
npm run test:db -- 140
npx vitest run src/views/team src/views/dashboard
```
On staging:
1. As TL, document a conversation with FA plus an action, and add a private and a shared note.
2. As FA: the dashboard shows the action; the profile isn't reachable (team module), but the shared note shows in the session data.
3. As DL: both notes are visible.
4. As finance/admin: no coaching data anywhere.

## What to look out for
- **Employees can't open their own profile page** (the team module is leader-only). They see their actions on the dashboard. If Profina wants a "Mein Profil" view, reuse `ProfilePage` under a self route; the RPC already allows self.
- **Retention** of coaching data (§8.4 "retention policy", OD-16) isn't automated. Notes are append-only, so deleting them for privacy reasons will need a dedicated, audited admin procedure.
- Prompts use simple thresholds (80 %). Make them configurable once Profina reviews the wording. Activity-based prompts (low activity, low conversion) come with Phase 4.
- The "Produktmix" KPI shows categories only; the points per category are in the RPC result if a chart is wanted.

## Edge cases covered by tests
**Write permissions**
- employees can't coach themselves; non-managers can't coach
- an action owned by the employee vs by the leader
- no future sessions; an unknown action owner is refused

**Visibility**
- the employee sees the session and **only the shared note**
- the employee completes their own action but not the leader's, and can't add notes about themselves
- the higher manager sees the private note
- **finance sees no coaching; admins see no notes**; peers see nothing

**Immutability**
- notes are append-only
- **private text is redacted in the audit trail**

**Profile**
- 12-month trend, header, next review date for managers
- overdue-action prompt
- own profile visible; peers and finance refused; admin sees the profile without coaching details

**UI**
- malformed id rejected
- prompts phrased as conversation starters with the "keine Bewertung" note
- private badge; forms only for managers
- dashboard shows the agreed actions
