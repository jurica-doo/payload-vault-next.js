/**
 * Consent state for display (§10.1, §10.5). The database decides at send
 * time (app_private.may_contact); this mirrors its order of checks so the
 * customer page explains why contact is or isn't allowed.
 */

export type ConsentEvent = {
  id: number;
  purpose: string;
  action: "granted" | "withdrawn" | "opt_out" | "opt_in" | string;
  legal_basis: string | null;
  source: string;
  evidence: string | null;
  effective_at: string;
};

export const PURPOSE_LABEL: Record<string, string> = {
  contact_phone: "Anruf",
  contact_email: "E-Mail (Service)",
  contact_whatsapp: "WhatsApp",
  marketing_email: "Werbe-E-Mails",
  birthday_email: "Geburtstagsgrüße",
  holiday_email: "Feiertagsgrüße",
};

export const BASIS_LABEL: Record<string, string> = {
  consent: "Einwilligung",
  contract: "Vertrag / Anfrage",
  legitimate_interest: "Berechtigtes Interesse",
  legal_obligation: "Rechtliche Pflicht",
};

export const SOURCE_LABEL: Record<string, string> = {
  form: "Formular", phone: "Telefon", email: "E-Mail", in_person: "persönlich", letter: "Brief",
  portal: "Vertragsportal", import: "Import", lead: "aus Lead",
};

/** Latest event per purpose by effective time (ties: later entry), ignoring future events. */
export function currentState(events: ConsentEvent[], now = new Date().toISOString()): Map<string, ConsentEvent> {
  const state = new Map<string, ConsentEvent>();
  for (const e of events) {
    if (e.effective_at > now) continue;
    const cur = state.get(e.purpose);
    if (!cur || e.effective_at > cur.effective_at || (e.effective_at === cur.effective_at && e.id > cur.id)) state.set(e.purpose, e);
  }
  return state;
}

export type ContactCheck = { allowed: boolean; reason: string };

export const REASON_LABEL: Record<string, string> = {
  opt_out: "Widerspruch gegen jede Kontaktaufnahme",
  no_address: "keine Adresse/Nummer hinterlegt",
  no_birth_date: "kein Geburtsdatum hinterlegt",
  no_legal_basis: "keine Rechtsgrundlage erfasst",
  withdrawn: "widerrufen",
  customer_inactive: "Kunde archiviert oder ehemalig",
  ok: "erlaubt",
};

const EMAIL = new Set(["contact_email", "marketing_email", "birthday_email", "holiday_email"]);

export function mayContact(
  customer: { email: string | null; phone: string | null; date_of_birth: string | null; archived_at: string | null; status: string },
  state: Map<string, ConsentEvent>,
  purpose: string,
): ContactCheck {
  if (customer.archived_at || customer.status === "former") return { allowed: false, reason: "customer_inactive" };
  if (state.get("all")?.action === "opt_out") return { allowed: false, reason: "opt_out" };
  if (EMAIL.has(purpose) && !customer.email) return { allowed: false, reason: "no_address" };
  if ((purpose === "contact_phone" || purpose === "contact_whatsapp") && !customer.phone) return { allowed: false, reason: "no_address" };
  if (purpose === "birthday_email" && !customer.date_of_birth) return { allowed: false, reason: "no_birth_date" };
  const last = state.get(purpose);
  if (!last) return { allowed: false, reason: "no_legal_basis" };
  if (last.action === "withdrawn") return { allowed: false, reason: "withdrawn" };
  return { allowed: true, reason: "ok" };
}
