# Go-live runbook (Vercel · Supabase · Resend · Gemini)

Steps in order. Everything that the code can do is done; this list is what has to be set up in the services and
entered in the app. Open questions for Profina are at the end.

## 1. Supabase (production project)

1. Region: create or keep the project in the EU (recommended: Frankfurt, `eu-central-1`). Enter the region in
   `src/data/legalEntity.ts` → `dataRegion` (shown in the Datenschutzerklärung).
2. Apply all migrations in order (`supabase db push`), including `20261101170000` … `20261101200000`.
3. Authentication → Sign In / Providers: „Allow new users to sign up“ **off**, Email provider **on**, TOTP MFA **on**.
4. Authentication → URL Configuration: Site URL = production address; add `https://<app>/update-passwort`.
5. Authentication → Emails → **SMTP Settings** (account e-mails via Resend):
   host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender e.g.
   `Profina <noreply@pro-fina.de>` (domain verified in Resend, see 3.).
6. Authentication → Emails → **Templates**: copy subject and HTML from `supabase/templates/`
   (`invite.html`, `recovery.html`, `email_change.html`, `confirmation.html`; subjects in `supabase/config.toml`).
7. Database → Extensions: enable `pg_cron`, then `select app_private.schedule_jobs();` and
   `select app_private.schedule_email_jobs();`.
8. Run Security Advisor and Performance Advisor: expected **no WARN**.

## 2. Edge Functions

Deploy all five: `invite-employee`, `extract-data-from-expense-image`, `send-emails`, `email-events`,
`email-unsubscribe` (`supabase functions deploy <name>`; `verify_jwt` settings come from `config.toml`).

| Secret | Value |
|---|---|
| `APP_ORIGIN` | production address, e.g. `https://app.pro-fina.de` |
| `GOOGLE_API_KEY` | Gemini API key (**paid tier**, see questions) |
| `EMAIL_PROVIDER` | `resend` (staging: `dryrun`) |
| `RESEND_API_KEY` | Resend API key with sending access |
| `EMAIL_FROM` | e.g. `Profina <kunden@pro-fina.de>` (verified domain) |
| `EMAIL_CRON_SECRET` | random, long; the scheduler sends it as `x-cron-secret` |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from the Resend webhook (see 3.) |
| `EMAIL_WEBHOOK_SECRET` | random, only for manual test calls |

Schedule `send-emails` every 10 minutes (Supabase scheduled function or `pg_net` + `pg_cron`) with the header
`x-cron-secret`.

## 3. Resend

1. Add and verify the sending domain (SPF, DKIM; DMARC recommended). Region: EU if available for the account.
2. Webhook → endpoint `https://<project>.supabase.co/functions/v1/email-events`, events `email.delivered`,
   `email.bounced`, `email.complained`; copy the signing secret into `RESEND_WEBHOOK_SECRET`.
3. Sign the data processing agreement (DPA) in the Resend dashboard.

## 4. Vercel

1. Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production and Preview); remove
   `NEXT_PUBLIC_ALLOWED_EMAILS`.
2. Domain and HTTPS; the CSP in `proxy.ts` follows `NEXT_PUBLIC_SUPABASE_URL` automatically.
3. Sign the Vercel DPA.

## 5. In the app (admin with 2FA)

1. `src/data/legalEntity.ts`: fill every `null` (management, phone, e-mail, register court and number, VAT ID,
   Vermittlerregister number, IHK, holdings, § 18 MStV person, data protection officer, data region), deploy. Until then
   Impressum and Datenschutz show „noch offen“ markers.
2. Kommunikation → **Absender & Pflichtangaben**: complete register, management, contact e-mail and app address
   (company and address are prefilled). Without them sending can't be switched on.
3. Kommunikation → Vorlagen: review the three German drafts (Geburtstagsgruß, Weihnachts- und Neujahrsgruß, Einladung
   zum Jahresgespräch), submit; a second person approves. Send yourself a test mail.
4. Lead-Einstellungen: save the first-contact SLA once (values decided by Profina, OD-19); this removes the provisional
   notice.
5. Feature flags one module at a time; e-mail sending last (Gate E).

## 6. Lost authenticator (support process)

An admin opens Verwaltung → Mitarbeitende → row menu → **2FA zurücksetzen**, after confirming the person's identity
(e.g. call back on the known number). The factor is removed, all sessions end, the person gets a notification and
sets up a new authenticator at „Sicherheit“. Nobody can reset their own factor; the reset is in the audit log.

## Open questions

1. Operator data for Impressum/Datenschutz: Geschäftsführung, Telefon, E-Mail, Registergericht und -nummer, USt-IdNr.,
   Vermittlerregister-Nummer, zuständige IHK, Beteiligungen nach § 15 VersVermV (or „keine“), verantwortliche Person nach
   § 18 Abs. 2 MStV, Datenschutzbeauftragte/r.
2. Is Profina Deutschland GmbH the operator of the app (controller), or is it operated by a service provider on
   Profina's behalf?
3. Supabase region of the production project, and Resend region.
4. Gemini: is the key on a **paid** plan? On the free tier Google may use inputs to improve its products; the privacy
   text says it doesn't.
5. Production address of the app (for `APP_ORIGIN`, the unsubscribe link and the auth redirect).
6. Sender addresses: for account e-mails (e.g. `noreply@…`) and for client mails (e.g. `kunden@…`).
7. Lead SLA values (OD-19), retention periods (OD-16).
