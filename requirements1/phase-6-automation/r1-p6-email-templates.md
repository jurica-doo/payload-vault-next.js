# r1/p6/email-templates — versioned templates with four-eyes approval

Branch `r1/p6/email-templates` → merged into `r1/p6-automation`.
Spec: §10.2 (template editor, merge fields, preview, role-based approval), §12.3 (email templates in the audit trail), §14.6.

## What was built

**Database** — `supabase/migrations/20261030100000_email_templates.sql`
- `email_templates`:
  - Name, occasion (Geburtstag / Feiertag / Jahresende / Service / Werbung) and **the legal bases it accepts** (default: Einwilligung only).
  - Each occasion maps to the consent purpose the engine checks: Geburtstag → `birthday_email`, Feiertag and Jahresende → `holiday_email`, Service → `contact_email`, Werbung → `marketing_email`.
  - `active_version_id` points to the version currently in use.
- `email_template_versions`:
  - **Lifecycle**: draft → submitted → approved / rejected. Approving retires the previous version.
  - **Immutable** once approved or retired (trigger). Retired versions can't be deleted either.
  - **One open version** (draft or submitted) per template; no edits while it waits for approval.
- **Four-eyes**: the approver must not be the author. Editing a draft makes the editor its author, so nobody can edit someone else's draft and then approve it themselves. Both people need admin or compliance with MFA. Rejection requires a reason.
- **Merge fields** are a whitelist: `{{vorname}} {{nachname}} {{rufname}} {{name}} {{berater_vorname}} {{berater_name}} {{berater_email}} {{berater_telefon}} {{jahr}}`. Unknown or unclosed placeholders are rejected when saving.
- **Safe rendering** (`app_private.render_text`):
  - **No authored HTML**: templates are plain text; the HTML version is created by escaping the template and the values, so no markup or script can get in.
  - **No header injection**: line breaks in values are removed from the subject.
  - **Literal values**: special characters (`\1`, `$`, `&`) stay as written.
  - **Missing values** are reported in `missing`. The engine (next slice) suppresses a send instead of mailing „Liebe ,“.
- `rpc_preview_template(version, customer?)`: sample data, or a real customer the caller may see.
- Audited: templates and versions, with reasons such as „Vorlage freigegeben“.
- Readable by admin and compliance only.

**TypeScript** — `src/domain/emailTemplate.ts` mirrors the check and the renderer for the live preview. Golden cases **GC-MERGE-001…007** are shared with pgTAP, so parity is now **58** IDs.

**Frontend**
- `/vertrieb/kunden/kommunikation` (admin and compliance; linked as „Kommunikation“ from the customer list): the templates section.
  - Create a template; choose its accepted legal bases.
  - Edit subject and text with the placeholder list and a validity check, plus a **live preview** with sample data. The preview HTML comes only from escaped text.
  - Save draft → submit → approve / reject (with reason). The author sees „Freigabe durch eine zweite Person“ instead of the buttons.
  - Version history.
- `useEmailTemplates` hook; German error texts.

## Tests
- pgTAP `240_email_templates.test.sql` (24): the 7 golden render cases (8 assertions); whitelist and malformed placeholders; advisers can't manage or read; MFA; draft edit and preview; no edits while waiting; four-eyes; rejection needs a reason; approval activates; a new version retires the old; immutability of approved and retired versions; audit.
- Vitest `emailTemplate.test.ts` (8).
- Totals: 723 pgTAP assertions (25 files), 363 unit tests, 58 golden IDs, lint at 0 errors, build OK.

## What to look at when testing
1. As admin with MFA, create „Geburtstag“, type `Alles Gute, {{rufname}}!` and watch the preview. Type `{{iban}}`: the error shows and saving is disabled.
2. Submit it, then try to approve it yourself: no button (the API refuses too). Log in as compliance and approve it.
3. Edit again: a new version (v2) starts; v1 stays active until v2 is approved.
4. Put `<script>` in the text: the preview shows it as text.

## Edge cases & decisions
- **The accepted legal bases** per template are Profina's decision (§10.5). The default is strict (consent only).
- **No rich-text editor** on purpose: plain text plus escaping removes a whole class of injection risks, and greetings rarely need formatting. A safe formatting subset can come later if required.
- **Test send** to the requesting user only needs the email provider (OD-11) and is part of the engine slice.
