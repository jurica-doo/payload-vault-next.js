/**
 * Pure lead rules for the UI. The database enforces the same rules
 * (app_private.lead_missing_fields, rpc_set_lead_stage); these let forms show
 * what's missing before the user submits.
 */

export const REQUIRED_FIELD_LABEL: Record<string, string> = {
  owner: "zuständige Person",
  phone_or_email: "Telefon oder E-Mail",
  product_interest: "Produktinteresse",
  next_action_at: "Datum für den nächsten Schritt",
  loss_reason: "Verlustgrund",
  consent: "Rechtsgrundlage für die Kontaktaufnahme",
  production: "verknüpfter Vertrag",
  appointment: "vereinbarter Termin",
  appointment_held: "durchgeführter Termin",
};

export const LOSS_REASON_LABEL: Record<string, string> = {
  no_interest: "Kein Interesse",
  not_reachable: "Nicht erreichbar",
  price: "Preis",
  competitor: "Wettbewerber",
  no_need: "Kein Bedarf",
  not_eligible: "Nicht versicherbar / nicht passend",
  other: "Sonstiges",
};

export const CHANNEL_LABEL: Record<string, string> = {
  any: "egal", phone: "Telefon", email: "E-Mail", whatsapp: "WhatsApp", in_person: "persönlich",
};

export const CONSENT_LABEL: Record<string, string> = {
  consent: "Einwilligung", contract: "Vertrag / Anfrage", legitimate_interest: "Berechtigtes Interesse",
};

export type LeadFacts = {
  owner_id: string | null;
  phone: string | null;
  email: string | null;
  product_interest: string[];
  next_action_at: string | null;
  loss_reason: string | null;
  consent_basis: string | null;
  production_id: string | null;
  hasAppointment: boolean;
  hasHeldAppointment: boolean;
};

/** Required fields of a stage that the lead doesn't satisfy yet. */
export function missingFields(lead: LeadFacts, required: string[]): string[] {
  const ok: Record<string, boolean> = {
    owner: lead.owner_id !== null,
    phone_or_email: Boolean(lead.phone || lead.email),
    product_interest: lead.product_interest.length > 0,
    next_action_at: lead.next_action_at !== null,
    loss_reason: lead.loss_reason !== null,
    consent: lead.consent_basis !== null,
    production: lead.production_id !== null,
    appointment: lead.hasAppointment,
    appointment_held: lead.hasHeldAppointment,
  };
  return required.filter((f) => ok[f] === false).sort();
}

export type SlaState = "met" | "late_met" | "open" | "overdue" | "none";

/** First-contact SLA for display: met, met late, still open, overdue. */
export function slaState(
  lead: { first_contact_at: string | null; sla_due_at: string | null; closed_at?: string | null },
  now = new Date().toISOString(),
): SlaState {
  if (!lead.sla_due_at) return "none";
  if (lead.first_contact_at) return lead.first_contact_at <= lead.sla_due_at ? "met" : "late_met";
  if (lead.closed_at) return "none";
  return lead.sla_due_at < now ? "overdue" : "open";
}

/** Whether moving between two stages needs a written reason (going back or reopening). */
export function stageChangeNeedsReason(
  from: { kind: string; position: number },
  to: { kind: string; position: number },
): boolean {
  if (from.kind !== "open" && to.kind === "open") return true;
  return from.kind === "open" && to.kind === "open" && to.position < from.position;
}
