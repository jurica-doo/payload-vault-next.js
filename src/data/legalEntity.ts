/**
 * Operator of the app (Impressum, Datenschutzerklärung). One place to fill in;
 * both legal pages read from here. `null` = not known yet: the pages show a
 * visible "noch offen" marker until it is filled (see LEGAL_OPEN_FIELDS).
 *
 * Known from the Profina contract documents (Stand 01.11.2026): company,
 * address, intermediary status (§ 34d Abs. 1 GewO, Versicherungsmehrfachagent).
 */
export type LegalEntity = {
  company: string;
  street: string;
  postalCity: string;
  country: string;
  /** Geschäftsführung (vertretungsberechtigt). */
  management: string | null;
  phone: string | null;
  email: string | null;
  registerCourt: string | null;
  registerNumber: string | null;
  vatId: string | null;
  /** Status under § 34d GewO. */
  intermediaryStatus: string;
  /** Registration number in the Vermittlerregister (D-XXXX-XXXXX-XX). */
  registerNumberIntermediary: string | null;
  /** Chamber (IHK) that granted the permission and keeps the registration. */
  permittingAuthority: string | null;
  /** § 15 VersVermV: direct/indirect holdings ≥ 10 % in or of insurers, or "keine". */
  holdings: string | null;
  /** Responsible for content (§ 18 Abs. 2 MStV): name and address. */
  contentResponsible: string | null;
  /** Data protection officer (Art. 37 GDPR), or null if none is designated. */
  dataProtectionOfficer: string | null;
  /** Region of the Supabase project (database, files, logins). */
  dataRegion: string | null;
  /** E-mail provider for client mails (OD-11). */
  emailProvider: string | null;
  /** Date the texts were last checked. */
  asOf: string;
};

export const LEGAL: LegalEntity = {
  company: "Profina Deutschland GmbH",
  street: "Castroper Straße 270–280",
  postalCity: "44791 Bochum",
  country: "Deutschland",
  management: null,
  phone: null,
  email: null,
  registerCourt: null,
  registerNumber: null,
  vatId: null,
  intermediaryStatus: "Versicherungsvertreter (Mehrfachagent) mit Erlaubnis nach § 34d Abs. 1 GewO",
  registerNumberIntermediary: null,
  permittingAuthority: null,
  holdings: null,
  contentResponsible: null,
  dataProtectionOfficer: null,
  dataRegion: null,
  emailProvider: "Resend (Resend Inc.)",
  asOf: "November 2026",
};

/** Labels of the fields still to be filled (shown in the "noch offen" markers). */
export const LEGAL_FIELD_LABEL: Record<keyof LegalEntity, string> = {
  company: "Firma", street: "Straße", postalCity: "PLZ und Ort", country: "Land",
  management: "Geschäftsführung", phone: "Telefon", email: "E-Mail", registerCourt: "Registergericht",
  registerNumber: "Registernummer", vatId: "USt-IdNr.", intermediaryStatus: "Vermittlerstatus",
  registerNumberIntermediary: "Registrierungsnummer im Vermittlerregister", permittingAuthority: "zuständige IHK",
  holdings: "Beteiligungen nach § 15 VersVermV", contentResponsible: "Verantwortlich nach § 18 Abs. 2 MStV",
  dataProtectionOfficer: "Datenschutzbeauftragte/r", dataRegion: "Speicherort der Daten (Region)",
  emailProvider: "E-Mail-Dienstleister", asOf: "Stand",
};

export const LEGAL_OPEN_FIELDS = (Object.keys(LEGAL) as (keyof LegalEntity)[]).filter((k) => LEGAL[k] === null);
