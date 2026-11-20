/**
 * Email template rules (§10.2). Mirrors app_private.check_template_text and
 * app_private.render_text so the editor previews exactly what will be sent.
 * Templates are plain text; HTML is produced by escaping, never authored.
 */

export const MERGE_FIELDS = [
  "vorname", "nachname", "rufname", "name", "briefanrede", "briefanrede_formell", "berater_vorname", "berater_name", "berater_email",
  "berater_telefon", "jahr",
] as const;

export const MERGE_FIELD_LABEL: Record<(typeof MERGE_FIELDS)[number], string> = {
  vorname: "Vorname", nachname: "Nachname", rufname: "Rufname (sonst Vorname)", name: "Vor- und Nachname",
  briefanrede: "„Liebe Frau Kowalski“ / „Lieber Herr …“ (ohne Anrede: „Guten Tag Vorname Nachname“)",
  briefanrede_formell: "„Sehr geehrte Frau Kowalski“ / „Sehr geehrter Herr …“ (ohne Anrede: „Guten Tag …“)",
  berater_vorname: "Vorname Berater/in", berater_name: "Name Berater/in", berater_email: "E-Mail Berater/in",
  berater_telefon: "Telefon Berater/in", jahr: "aktuelles Jahr",
};

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

export type TemplateProblem = { kind: "invalid_template" } | { kind: "unknown_merge_field"; field: string };

export function checkTemplateText(text: string): TemplateProblem | null {
  const opened = text.split("{{").length - 1;
  const fields = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
  if (opened !== fields.length) return { kind: "invalid_template" };
  const unknown = fields.find((f) => !(MERGE_FIELDS as readonly string[]).includes(f));
  return unknown ? { kind: "unknown_merge_field", field: unknown } : null;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type Rendered = { subject: string; text: string; html: string; missing: string[] };

export function renderTemplate(subject: string, body: string, values: Partial<Record<string, string | null>>): Rendered {
  const fields = [...new Set([...`${subject}\n${body}`.matchAll(PLACEHOLDER)].map((m) => m[1]))];
  const missing: string[] = [];
  const value = (f: string) => {
    const v = (values[f] ?? "").trim();
    if (!v) missing.push(f);
    return v;
  };
  const resolved = Object.fromEntries(fields.map((f) => [f, value(f)]));
  const fill = (s: string, map: (v: string) => string) => s.replace(PLACEHOLDER, (_m, f: string) => map(resolved[f] ?? ""));
  const html = fill(escapeHtml(body), escapeHtml);
  return {
    // A subject is one line (P6-01): authored line breaks are flattened too, as in SQL render_text.
    subject: fill(subject, (v) => v.replace(/[\r\n]+/g, " ")).replace(/[\r\n]+/g, " ").trim(),
    text: fill(body, (v) => v),
    html: `<p>${html.replace(/\r?\n\r?\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
    missing: missing.sort(),
  };
}

export const SAMPLE_VALUES: Record<string, string> = {
  vorname: "Erika", nachname: "Mustermann", rufname: "Erika", name: "Erika Mustermann",
  briefanrede: "Liebe Frau Mustermann", briefanrede_formell: "Sehr geehrte Frau Mustermann", berater_vorname: "Max",
  berater_name: "Max Berater", berater_email: "max.berater@profina.example", berater_telefon: "+49 170 0000000",
  jahr: String(new Date().getFullYear()),
};

/** Sender's mandatory details (app_settings 'email_sender'), as rpc_email_sender returns them. */
export type EmailSender = Partial<Record<"company" | "address" | "register" | "management" | "contact_email" | "app_url", string>> & {
  complete?: boolean;
};

export type Salutation = "frau" | "herr" | "divers";
export const SALUTATION_LABEL: Record<Salutation, string> = { frau: "Frau", herr: "Herr", divers: "keine Angabe / divers" };

/** Mirror of app_private.salutation_line: never empty, neutral without a gendered salutation. */
export function salutationLine(salutation: string | null | undefined, first: string | null, last: string | null, formal: boolean): string {
  const l = (last ?? "").trim();
  if (salutation === "frau" && l) return `${formal ? "Sehr geehrte Frau" : "Liebe Frau"} ${l}`;
  if (salutation === "herr" && l) return `${formal ? "Sehr geehrter Herr" : "Lieber Herr"} ${l}`;
  return `Guten Tag ${`${first ?? ""} ${last ?? ""}`.trim()}`.trim();
}

/**
 * Mirror of app_private.email_footer for the preview: adviser signature,
 * the sender's mandatory details and the unsubscribe link. Every client mail
 * ends with it; the template author can't remove it.
 */
export function renderFooter(sender: EmailSender, values: Partial<Record<string, string | null>>, unsubscribeUrl: string) {
  const join = (parts: (string | null | undefined)[]) => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
  const sign = join([values.berater_name, values.berater_telefon, values.berater_email]);
  const lines = [
    sign ? `Ihr Ansprechpartner: ${sign}` : "",
    join([sender.company, sender.address]),
    join([sender.register, sender.management ? `Geschäftsführung: ${sender.management}` : "", sender.contact_email]),
  ].filter(Boolean);
  return {
    text: `\n\n-- \n${lines.join("\n")}\n\nSie möchten keine E-Mails dieser Art mehr erhalten? Abmelden: ${unsubscribeUrl}`,
    html:
      '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px">' +
      `<p style="font-size:12px;color:#666;line-height:1.5">${lines.map(escapeHtml).join("<br>")}</p>` +
      `<p style="font-size:12px;color:#666">Sie möchten keine E-Mails dieser Art mehr erhalten? <a href="${escapeHtml(unsubscribeUrl)}">Hier abmelden</a>.</p>`,
  };
}

/** Consent purpose a template's mails belong to (mirror of app_private.consent_purpose_for). */
export const consentPurposeFor = (purpose: string) =>
  ({ birthday: "birthday_email", holiday: "holiday_email", year_end: "holiday_email", service: "contact_email" })[purpose] ?? "marketing_email";

export const sampleUnsubscribeUrl = (sender: EmailSender, purpose: string) =>
  `${(sender.app_url ?? "").replace(/\/+$/, "")}/abmelden?t=00000000-0000-0000-0000-000000000000&z=${consentPurposeFor(purpose)}`;
