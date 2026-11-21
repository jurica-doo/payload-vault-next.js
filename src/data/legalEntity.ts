/**
 * Operator of the app (Impressum, Datenschutzerklärung). One place to fill in;
 * both legal pages read from here. `null` = not known yet: the pages show a
 * visible "noch offen" marker until it is filled (see LEGAL_OPEN_FIELDS).
 *
 * Source: Impressum and Datenschutzerklärung of profina-vuletic.de (read
 * 2026-11-21). The app is run by Bazilije Vuletić (sole trader, bound
 * insurance agent) on behalf of Profina Deutschland GmbH; he is the controller.
 */
export type LegalEntity = {
  /** Operator as named in the Impressum (natural person for a sole trader). */
  operator: string;
  /** What the business does, shown under the name. */
  trade: string;
  street: string;
  postalCity: string;
  country: string;
  /** Company the operator works for and represents ("in Vertretung der …"). */
  principal: string;
  principalAddress: string;
  phone: string | null;
  email: string | null;
  /** Statement on VAT (USt-IdNr. or the small-business rule). */
  vat: string | null;
  /** Status under § 34d GewO. */
  intermediaryStatus: string;
  /** Registration number in the Vermittlerregister (D-XXXX-XXXXX-XX). */
  registerNumberIntermediary: string | null;
  /** Chamber (IHK) that keeps the registration (§ 11a GewO). */
  registerAuthority: string | null;
  /** Bound agent (§ 34d Abs. 7 GewO): the insurer that assumes liability. */
  liableInsurer: string | null;
  /** Responsible for content (§ 18 Abs. 2 MStV): name and address. */
  contentResponsible: string | null;
  /** Data protection officer (Art. 37 GDPR); undefined = none designated (no line shown). */
  dataProtectionOfficer?: string | null;
  /** Region of the Supabase project (database, files, logins). */
  dataRegion: string | null;
  /** E-mail provider (account e-mails and client mails). */
  emailProvider: string | null;
  /** Date the texts were last checked. */
  asOf: string;
};

export const LEGAL: LegalEntity = {
  operator: "Bazilije Vuletić",
  trade: "Vermittlung von Versicherungen",
  street: "Kölner Str. 152",
  postalCity: "58509 Lüdenscheid",
  country: "Deutschland",
  principal: "Profina Deutschland GmbH",
  principalAddress: "Castroper Straße 270–280, 44791 Bochum",
  phone: "+49 160 2222992",
  email: "vuletic@pro-fina.de",
  vat: "Keine Umsatzsteuerpflicht nach § 19 UStG (Kleinunternehmerregelung).",
  intermediaryStatus: "Gebundener Versicherungsvertreter nach § 34d Abs. 7 GewO",
  registerNumberIntermediary: "D-6FME-UFOB4-98",
  registerAuthority: "Südwestfälische Industrie- und Handelskammer zu Hagen, Bahnhofstraße 18, 58095 Hagen",
  liableInsurer: "Barmenia Krankenversicherung AG",
  contentResponsible: "Bazilije Vuletić, Kölner Str. 152, 58509 Lüdenscheid",
  dataRegion: "Irland (EU), Region eu-west-1",
  emailProvider: "Resend",
  asOf: "November 2026",
};

/** Labels of the fields still to be filled (shown in the "noch offen" markers). */
export const LEGAL_FIELD_LABEL: Record<keyof LegalEntity, string> = {
  operator: "Anbieter", trade: "Tätigkeit", street: "Straße", postalCity: "PLZ und Ort", country: "Land",
  principal: "vertretenes Unternehmen", principalAddress: "Anschrift des vertretenen Unternehmens",
  phone: "Telefon", email: "E-Mail", vat: "Umsatzsteuer", intermediaryStatus: "Vermittlerstatus",
  registerNumberIntermediary: "Registrierungsnummer im Vermittlerregister", registerAuthority: "Registerstelle (IHK)",
  liableInsurer: "haftungsübernehmendes Versicherungsunternehmen", contentResponsible: "Verantwortlich nach § 18 Abs. 2 MStV",
  dataProtectionOfficer: "Datenschutzbeauftragte/r", dataRegion: "Speicherort der Daten (Region)",
  emailProvider: "E-Mail-Dienstleister", asOf: "Stand",
};

export const LEGAL_OPEN_FIELDS = (Object.keys(LEGAL) as (keyof LegalEntity)[]).filter((k) => LEGAL[k] === null);
