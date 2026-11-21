# Go-live runbook (Vercel · Supabase · Resend · Gemini)

Steps in order. Everything that the code can do is done; this list is what has to be set up in the services and
entered in the app.

**Operator (answered 2026-11-21):** Bazilije Vuletić, Kölner Str. 152, 58509 Lüdenscheid, gebundener
Versicherungsvertreter (§ 34d Abs. 7 GewO, D-6FME-UFOB4-98), runs the app in Vertretung der Profina Deutschland GmbH
and is the controller. App address **https://payload-vault.profina-vuletic.de**; region **Frankfurt** (Vercel `fra1`,
Supabase `eu-central-1`); Gemini on a **paid** key; e-mail domain **profina-vuletic.de**.

## 1. Supabase (production project)

1. Region: Frankfurt (`eu-central-1`), matching `dataRegion` in `src/data/legalEntity.ts`.
2. Apply all migrations in order (`supabase db push`), including `20261101170000` … `20261101200000`.
3. Authentication → Sign In / Providers: „Allow new users to sign up“ **off**, Email provider **on**, TOTP MFA **on**.
4. Authentication → URL Configuration: Site URL `https://payload-vault.profina-vuletic.de`; redirect URLs
   `https://payload-vault.profina-vuletic.de/update-passwort` and `https://payload-vault.profina-vuletic.de/**`.
5. Authentication → Emails → **SMTP Settings** (account e-mails via Resend):
   host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key, sender
   `noreply@profina-vuletic.de`, name `Profina Vuletić` (domain verified in Resend, see 3.).
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
| `APP_ORIGIN` | `https://payload-vault.profina-vuletic.de` |
| `GOOGLE_API_KEY` | Gemini API key (paid tier) |
| `EMAIL_PROVIDER` | `resend` (staging: `dryrun`) |
| `RESEND_API_KEY` | Resend API key with sending access |
| `EMAIL_FROM` | `Profina Vuletić <noreply@profina-vuletic.de>` (test mails, fallback) |
| `EMAIL_SENDER_DOMAIN` | `profina-vuletic.de`: client mails go out as „Vorname Nachname <tag@profina-vuletic.de>“, tag = the part of the adviser's e-mail before the @, Reply-To = the adviser's own e-mail |
| `EMAIL_CRON_SECRET` | random, long; the scheduler sends it as `x-cron-secret` |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from the Resend webhook (see 3.) |
| `EMAIL_WEBHOOK_SECRET` | random, only for manual test calls |

Schedule `send-emails` every 10 minutes (Supabase scheduled function or `pg_net` + `pg_cron`) with the header
`x-cron-secret`.

## 3. Resend

1. Add and verify `profina-vuletic.de` (SPF, DKIM; DMARC recommended), region EU (Ireland) if offered. Any
   address on the verified domain can send, so every adviser's tag works without a mailbox; replies go to the
   adviser's own address (Reply-To).
2. Webhook → endpoint `https://<project>.supabase.co/functions/v1/email-events`, events `email.delivered`,
   `email.bounced`, `email.complained`; copy the signing secret into `RESEND_WEBHOOK_SECRET`.
3. Sign the data processing agreement (DPA) in the Resend dashboard.

## 4. Vercel

1. Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production and Preview); remove
   `NEXT_PUBLIC_ALLOWED_EMAILS`. Function region `fra1` comes from `vercel.json`.
2. Domain `payload-vault.profina-vuletic.de` (CNAME to Vercel) and HTTPS; the CSP in `proxy.ts` follows
   `NEXT_PUBLIC_SUPABASE_URL` automatically.
3. Sign the Vercel DPA.

## 5. In the app (admin with 2FA)

1. `src/data/legalEntity.ts` is filled from the Impressum of profina-vuletic.de; check it once more before go-live.
2. Kommunikation → **Absender & Pflichtangaben**: prefilled (operator, address, Vermittlerregister, contact
   `vuletic@pro-fina.de`, app address) and complete; check them.
3. Kommunikation → Vorlagen: review the three German drafts (Geburtstagsgruß, Weihnachts- und Neujahrsgruß, Einladung
   zum Jahresgespräch), submit; a second person approves. Send yourself a test mail.
4. Lead-Einstellungen: default saved (first contact within 8 business hours, Mon–Fri 09–17, NRW holidays,
   escalation to the manager). Holidays for 2029+ must be added there each year. Retention defaults: customers 10
   years after the relationship ends, leads 2 years after closing (report only, in Datenschutz).
5. Feature flags one module at a time; e-mail sending last (Gate E).

## 6. Lost authenticator (support process)

An admin opens Verwaltung → Mitarbeitende → row menu → **2FA zurücksetzen**, after confirming the person's identity
(e.g. call back on the known number). The factor is removed, all sessions end, the person gets a notification and
sets up a new authenticator at „Sicherheit“. Nobody can reset their own factor; the reset is in the audit log.

## Open questions

1. Data protection officer: none is named on profina-vuletic.de, so the app names none. Required once 20 or more
   people regularly process personal data (§ 38 BDSG) — check with Profina whether its DPO covers the structure.
2. Holdings under § 15 VersVermV (usually „keine“) belong in the Erstinformation to clients; not on the website.
3. Retention defaults (10 / 2 years) and the lead SLA (8 business hours) are sensible defaults, not Profina decisions;
   change them when Profina decides (OD-16, OD-19).
4. A data processing agreement between Bazilije Vuletić and Profina Deutschland GmbH (who is controller for the
   client data in the sales part) — confirm with Profina.
