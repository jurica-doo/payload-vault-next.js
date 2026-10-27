import { cardClass } from "../../components/card/card.const";
import type { StatusMap } from "../../components/statusBadge/StatusBadge";

export const SEND_STATUS: StatusMap<string> = {
  queued: { label: "geplant", tone: "info" },
  sending: { label: "wird gesendet", tone: "info" },
  sent: { label: "gesendet", tone: "success" },
  delivered: { label: "zugestellt", tone: "success" },
  bounced: { label: "unzustellbar", tone: "error" },
  failed: { label: "fehlgeschlagen", tone: "error" },
  suppressed: { label: "nicht gesendet", tone: "neutral" },
  expired: { label: "verfallen", tone: "neutral" },
};

export const SUPPRESSION_REASON: Record<string, string> = {
  no_legal_basis: "keine Rechtsgrundlage",
  withdrawn: "widerrufen",
  opt_out: "Widerspruch",
  no_address: "keine E-Mail-Adresse",
  no_birth_date: "kein Geburtsdatum",
  customer_inactive: "Kunde inaktiv",
  customer_not_found: "Kunde gelöscht",
  basis_not_allowed: "Rechtsgrundlage für diese Vorlage nicht zugelassen",
  suppressed_address: "Adresse gesperrt",
  missing_merge_field: "Daten für Platzhalter fehlen",
  campaign_cancelled: "Kampagne abgebrochen",
  occasion_passed: "Anlass vorbei",
};

export const card = cardClass;
