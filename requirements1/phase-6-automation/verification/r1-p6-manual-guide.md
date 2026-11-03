# Phase 6 — Manual test guide

Covers email templates, the email engine (switch, window, campaigns, block list, send log, test mail, Edge Functions)
and advanced analytics. Findings go to [r1-p6-verification.md](r1-p6-verification.md) as `P6-xx`.

## Setup
1. `supabase migration up`, `npm run dev`. Test accounts with password `123456`; 2FA codes: `npm run totp -- <email>` (admin@, compliance@).
2. Sign in as **admin@test.com** in one browser and **compliance@test.com** in another (four-eyes needs two people).
3. Confirm 2FA for both at `/profil/sicherheit` (Kommunikation is read-only without it).
4. Some customers with a birth date today and a „Geburtstagsmail“ consent (customer detail → Einwilligungen).

## Inventory: where Phase 6 lives
- `/vertrieb/kunden/kommunikation`:
  - Automatischer Versand (switch, window, daily limit, days)
  - Vorlagen (editor, live preview, legal bases, four-eyes, test mail)
  - Kampagnen
  - Sperrliste (block, search, lift, **CSV import**)
  - Versandprotokoll
- Customer detail → „Automatische E-Mails“.
- Cockpit → „Hinweise“ (team signals); lead analytics → „Quellen im Zeitverlauf“.
- Edge Functions `send-emails` (cron, secret) and `email-events` (provider webhook, secret).

## Access matrix
| Who | Sees Kommunikation | Writes | Switch on |
|---|---|---|---|
| Adviser, leader, finance | no | no | no |
| Compliance without / with 2FA | yes | no / yes | no |
| Admin without / with 2FA | yes | no / yes | no / yes |

## Flows
1. **Template:**
   1. Create „Geburtstag <Datum>“ and write a subject and text with `{{rufname}}` and `{{berater_name}}`.
   2. Save the draft, then click „Zur Freigabe einreichen“. You can't approve your own.
   3. The other person approves it. The version list shows v1 „freigegeben“.
   4. Try a duplicate name (any case or spaces), a 2-character name, no legal basis, a subject over 200 characters, an unknown placeholder `{{iban}}`, an unclosed `{{vorname`, and `<script>` in the text (the preview shows it as text).
2. **Campaign:**
   1. „Kampagne anlegen“ (birthday), then Einreichen; the other person clicks Freigeben. The row shows „Vorlage v1“.
   2. Edit the template to v2 and approve it: the campaign still shows v1.
   3. A second birthday campaign can't be approved or resumed while one is active.
   4. Pausieren / Fortsetzen. „Kampagne abbrechen…“ is in the ⋯ menu and needs a reason.
3. **Send window:** time pickers. Start after end shows a message. An empty day selection or limit 0 is refused. Every change needs a reason.
4. **Block list:**
   1. Block an address with a reason, then block it again with a different reason (the reason updates).
   2. Search for it, then „Aufheben“ (needs a reason).
5. **Block-list import:**
   1. „CSV importieren“ → „Vorlage herunterladen“ → fill it in Excel and save as CSV (also try „CSV (Trennzeichen-getrennt)“, i.e. Windows-1252).
   2. Add a duplicate, an invalid address, an unknown reason and an address that is already blocked.
   3. The result shows new / already blocked / bad rows, with the file line numbers.
6. **Send log:** filter by status (filtered in the database), page through it. Customer shown as K-number, notes in German.
7. **Test mail:** „Testmail an mich“ goes to the log as Testmail. The 11th within an hour is refused.

## Dry-run send (local)
1. Write a scratch env file outside the repo with `EMAIL_PROVIDER=dryrun`, `EMAIL_FROM`, `EMAIL_CRON_SECRET`, `EMAIL_WEBHOOK_SECRET`, `APP_ORIGIN`.
2. Run `supabase functions serve --env-file <file> --no-verify-jwt`.
3. Admin switches sending on (with a reason) and sets the window to cover now.
4. Call `send-emails` with the header `x-cron-secret`:
   - The response is `{sent, failed, unreported}`.
   - The log shows „gesendet“ for customers with consent, and „nicht gesendet“ with a German reason for the rest.
   - A second call sends nothing new.
5. Call `email-events` with `x-webhook-secret` and `{"message_id": "<from the log>", "event": "bounced"}`: the address appears on the block list as „Unzustellbar“.
6. Edge cases for `email-events`:
   - wrong secret → 401
   - body > 10 KB (also chunked) → 413
   - `{}` → `invalid_payload`
7. Switch sending **off** again. Nothing more goes out; the history stays.

## UI / UX checklist
- Every action gives a toast that names what happened or failed. No raw codes anywhere.
- Without 2FA every write button is disabled and the notice explains why.
- Light and dark, 1,470 px and 360–500 px: no horizontal page scroll; the send log scrolls sideways inside its table.
- Keyboard only: Tab through the window form, menus (⋯), dialogs (Escape closes them, focus returns).

## Volume
- 5,000 production import rows stage in under a second.
- More than 500 blocked addresses and more than 200 log entries: all reachable through the pages.
