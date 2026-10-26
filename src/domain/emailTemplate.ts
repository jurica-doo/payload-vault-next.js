/**
 * Email template rules (§10.2). Mirrors app_private.check_template_text and
 * app_private.render_text so the editor previews exactly what will be sent.
 * Templates are plain text; HTML is produced by escaping, never authored.
 */

export const MERGE_FIELDS = [
  "vorname", "nachname", "rufname", "name", "berater_vorname", "berater_name", "berater_email", "berater_telefon", "jahr",
] as const;

export const MERGE_FIELD_LABEL: Record<(typeof MERGE_FIELDS)[number], string> = {
  vorname: "Vorname", nachname: "Nachname", rufname: "Rufname (sonst Vorname)", name: "Vor- und Nachname",
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
    subject: fill(subject, (v) => v.replace(/[\r\n]+/g, " ")),
    text: fill(body, (v) => v),
    html: `<p>${html.replace(/\r?\n\r?\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
    missing: missing.sort(),
  };
}

export const SAMPLE_VALUES: Record<string, string> = {
  vorname: "Erika", nachname: "Mustermann", rufname: "Erika", name: "Erika Mustermann", berater_vorname: "Max",
  berater_name: "Max Berater", berater_email: "max.berater@profina.example", berater_telefon: "+49 170 0000000",
  jahr: String(new Date().getFullYear()),
};
