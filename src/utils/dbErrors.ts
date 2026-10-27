/**
 * German messages for the machine keys our database functions raise
 * (convention from migration 20261026140000_audit.sql: the error message is
 * a stable key, the SQLSTATE says what kind of error it is).
 *
 * Unknown errors get a generic message; raw database text is never shown to
 * users because it can contain table or constraint names.
 */
const MESSAGES: Record<string, string> = {
  forbidden: "Dafür fehlt Ihnen die Berechtigung.",
  mfa_required: "Bitte bestätigen Sie Ihre Anmeldung zuerst mit der Zwei-Faktor-Anmeldung.",
  reason_required: "Bitte geben Sie eine Begründung mit mindestens 10 Zeichen an.",
  reason_too_long: "Die Begründung darf höchstens 500 Zeichen lang sein.",
  not_found: "Der Eintrag wurde nicht gefunden.",
  employee_exists: "Für diese E-Mail-Adresse gibt es bereits einen Mitarbeitenden.",
  already_linked: "Dieser Mitarbeitende hat bereits ein Konto.",
  invalid_status: "Diese Aktion ist im aktuellen Status nicht möglich.",
  no_open_invite: "Es gibt keine offene Einladung.",
  cannot_deactivate_self: "Sie können sich nicht selbst deaktivieren.",
  last_admin: "Der letzte Administrator kann nicht entfernt werden.",
  admin_exists: "Es gibt bereits einen Administrator.",
  rate_limited: "Zu viele Anfragen. Bitte später erneut versuchen.",
  user_exists: "Für diese E-Mail-Adresse existiert bereits ein Konto.",
  invite_send_failed: "Die Einladung konnte nicht versendet werden. Bitte erneut versuchen.",
  unauthorized: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  invalid_body: "Die Angaben sind unvollständig. Bitte prüfen Sie das Formular.",
  unavailable: "Der Dienst ist gerade nicht erreichbar. Bitte versuchen Sie es in einigen Minuten erneut.",
  not_configured: "Diese Funktion ist noch nicht eingerichtet. Bitte wenden Sie sich an die Verwaltung.",
  unexpected: "Unerwarteter Fehler auf dem Server. Bitte versuchen Sie es erneut.",
  audit_append_only: "Protokolleinträge können nicht geändert oder gelöscht werden.",
  "Registrierung ist derzeit nur für freigegebene E-Mail-Adressen möglich.":
    "Registrierung ist derzeit nur für freigegebene E-Mail-Adressen möglich.",

  // hierarchy
  hierarchy_cycle: "Diese Zuordnung würde einen Kreis in der Struktur erzeugen.",
  future_assignment_exists: "Es gibt bereits einen geplanten Wechsel. Bitte diesen zuerst absagen.",
  before_current_assignment: "Das Datum liegt vor der aktuellen Zuordnung. Die Historie kann nicht rückwirkend geändert werden.",
  before_start_date: "Das Datum liegt vor dem Eintrittsdatum.",
  manager_inactive: "Die gewählte Führungskraft ist inaktiv.",
  no_change: "Das entspricht bereits dem aktuellen Stand.",
  already_effective: "Dieser Wechsel ist bereits wirksam und kann nicht mehr abgesagt werden.",
  not_latest: "Nur der letzte geplante Wechsel kann abgesagt werden.",
  date_required: "Bitte ein Datum angeben.",

  // rules and levels
  draft_exists: "Es gibt bereits einen Entwurf. Bitte diesen bearbeiten oder verwerfen.",
  rule_version_immutable: "Veröffentlichte Versionen sind unveränderlich.",
  effective_date_not_future: "Neue Regeln dürfen nur in der Zukunft gelten.",
  effective_date_not_after_latest: "Das Datum muss nach der neuesten veröffentlichten Version liegen.",
  levels_incomplete: "Es müssen alle sieben Stufen vorhanden sein.",
  levels_entry_threshold: "Die Einstiegsstufe muss bei 0 Punkten beginnen.",
  levels_not_increasing: "Sätze und Schwellen müssen von Stufe zu Stufe steigen.",
  conversion_incomplete: "Für jede aktive Sparte wird eine Umrechnungsregel benötigt.",
  invalid_kind: "Unbekannte Regelart.",
  before_latest_level: "Das Datum liegt vor dem letzten Stufeneintrag.",

  // career
  not_qualified: "Die Person ist derzeit nicht qualifiziert.",
  level_changed_today: "Die Stufe wurde heute bereits geändert.",

  // commission
  still_not_bookable: "Noch nicht buchbar – die Ursache (z. B. fehlende Stufe) besteht weiterhin.",
  already_booked: "Für diese Berechnung wurde bereits Provision gebucht.",
  already_reversed: "Die Berechnung wurde bereits storniert.",
  invalid_transition: "Dieser Statuswechsel ist nicht möglich.",
  month_not_ended: "Der Monat ist noch nicht abgelaufen.",
  period_locked: "Der Monat ist freigegeben oder ausgezahlt und kann nicht mehr geändert werden.",
  subsidy_above_maximum: "Über dem Höchstbetrag der Stufe, bei FA oder Teilzeit nur mit Ausnahme-Begründung.",
  producer_without_level: "Für die Person ist keine Karrierestufe hinterlegt.",

  // goals
  month_closed: "Vergangene Monate können nicht mehr geändert werden.",
  month_too_far: "Ziele können höchstens zwei Monate im Voraus geplant werden.",
  awaiting_review: "Das Ziel wartet auf Freigabe und kann gerade nicht geändert werden.",
  goal_empty: "Bitte mindestens einen Zielwert eintragen.",
  cannot_review_own: "Eigene Ziele können nicht selbst freigegeben werden.",
  kv_above_points: "Das KV-Ziel darf nicht größer als das Punkteziel sein.",
  invalid_target_value: "Bitte nur positive Zahlen eintragen (Anzahlen ohne Nachkommastellen).",
  unknown_target: "Unbekanntes Zielfeld.",
  reviewer_not_employee: "Nur aktive Führungskräfte können Ziele freigeben.",
  invalid_decision: "Bitte entscheiden Sie: freigeben oder zurückgeben.",
  invalid_targets: "Die Zielwerte sind unvollständig oder ungültig.",

  // tasks
  owner_inactive: "Die Person ist inaktiv.",

  // activities
  date_in_future: "Das Datum darf nicht in der Zukunft liegen.",
  appointment_in_future: "Der Termin liegt noch in der Zukunft. Er kann erst danach als durchgeführt oder nicht erschienen markiert werden.",
  not_an_appointment: "Das ist kein Termin.",

  // leads
  lead_name_required: "Bitte einen Nachnamen oder eine Firma angeben.",
  invalid_phone: "Die Telefonnummer ist ungültig (z. B. 0170 1234567 oder +49 170 1234567).",
  invalid_email: "Die E-Mail-Adresse ist ungültig.",
  unknown_source: "Bitte eine aktive Lead-Quelle wählen.",
  possible_duplicate: "Es gibt bereits einen ähnlichen Lead. Bitte prüfen und bei Bedarf ausdrücklich bestätigen.",
  lead_merged: "Dieser Lead wurde mit einem anderen zusammengeführt.",
  lead_closed: "Der Lead ist abgeschlossen (gewonnen oder verloren).",
  unknown_stage: "Unbekannte oder deaktivierte Phase.",
  stage_requirements_missing: "Für diese Phase fehlen Pflichtangaben.",
  stage_skip_not_allowed: "Diese Phase darf nicht übersprungen werden.",
  production_not_owner: "Der Vertrag gehört nicht der zuständigen Person.",
  stage_required: "Diese Phase kann nicht deaktiviert werden.",
  stage_in_use: "In dieser Phase befinden sich noch Leads.",
  invalid_input: "Bitte prüfen Sie Ihre Eingaben.",
  append_only: "Verlaufseinträge können nicht geändert werden.",
  "calendar exhausted": "Für die Frist konnte kein Arbeitstag ermittelt werden. Bitte die Feiertage in den Lead-Einstellungen prüfen.",
  calendar_exhausted: "Für die Frist konnte kein Arbeitstag ermittelt werden. Bitte die Feiertage in den Lead-Einstellungen prüfen.",

  // customers
  customer_name_required: "Bitte einen Nachnamen oder eine Firma angeben.",
  invalid_date_of_birth: "Das Geburtsdatum ist ungültig.",
  customer_erased: "Die Daten dieses Kunden wurden gelöscht (pseudonymisiert).",
  already_converted: "Dieser Lead wurde bereits in einen Kunden umgewandelt.",
  lead_unassigned: "Der Lead muss zuerst einer Person zugewiesen werden.",
  consent_evidence_required: "Bitte angeben, wo und wie die Einwilligung erteilt wurde.",

  // contracts
  contract_exists: "Diese Vertragsnummer ist bereits verknüpft.",
  dates_unconfirmed: "Vertragsdaten bitte nur nach Prüfung der Unterlagen eintragen und bestätigen.",
  invalid_deep_link: "Der Link muss mit https:// beginnen und auf das Vertragsportal zeigen.",
  unknown_source_system: "Unbekanntes Quellsystem.",
  synced_read_only: "Synchronisierte Verträge werden im Vertragsportal gepflegt.",
  external_id_taken: "Diese Kundennummer ist bereits einem anderen Kunden zugeordnet.",
  // email
  unknown_merge_field: "Unbekannter Platzhalter in der Vorlage.",
  invalid_template: "Ein Platzhalter ist nicht korrekt geschlossen ({{feld}}).",
  template_purpose_mismatch: "Für Geburtstagskampagnen bitte eine Geburtstagsvorlage wählen.",
  template_not_approved: "Die Vorlage hat noch keine freigegebene Version.",
  date_in_past: "Das Datum liegt in der Vergangenheit.",
  cannot_approve_own: "Eigene Vorlagen und Kampagnen können nicht selbst freigegeben werden (Vier-Augen-Prinzip).",
  template_version_immutable: "Freigegebene Vorlagen können nicht mehr geändert werden. Bitte eine neue Version anlegen.",
  wrong_request_kind: "Diese Aktion passt nicht zur Art der Anfrage.",
  use_dedicated_action: "Auskunft und Löschung werden durch Export bzw. Pseudonymisierung abgeschlossen.",
  renewal_date_unconfirmed: "Für diesen Vertrag ist keine bestätigte Hauptfälligkeit hinterlegt.",

  // production
  no_rules_for_date: "Für dieses Datum gibt es keine gültigen Umrechnungsregeln.",
  premium_must_be_positive: "Der Beitrag muss größer als 0 sein.",
  currency_not_supported: "Nur Beiträge in Euro werden unterstützt.",
  unknown_category: "Unbekannte Sparte.",
  premium_period_mismatch: "Für diese Sparte passt der Zahlungsrhythmus nicht (z. B. KV und LV monatlich, Sach jährlich).",
  net_premium_required: "Für Sachversicherungen wird der Jahresnettobeitrag benötigt.",
  term_required: "Für Lebensversicherungen wird die Laufzeit benötigt.",
  before_producer_start: "Das Produktionsdatum liegt vor dem Eintritt der Person.",
  after_producer_deactivation: "Das Produktionsdatum liegt nach der Deaktivierung der Person.",
  production_date_in_future: "Das Produktionsdatum darf nicht in der Zukunft liegen.",
  not_editable: "Nur Entwürfe können bearbeitet werden.",
  unknown_producer: "Unbekannte Person.",
  invalid_payload: "Die Importdatei konnte nicht gelesen werden.",
  too_many_rows: "Höchstens 5.000 Zeilen pro Import.",

  // receipt AI (edge function extract-data-from-expense-image)
  invalid_file_path: "Die Datei wurde nicht gefunden. Bitte laden Sie sie erneut hoch.",
  file_too_large: "Die Datei ist zu groß. Bitte eine kleinere Datei oder ein komprimiertes Foto verwenden.",
  ai_unavailable: "Die automatische Belegerkennung ist gerade nicht verfügbar. Bitte versuchen Sie es in wenigen Minuten erneut.",
  processing_failed: "Der Beleg konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
};

/** Fallbacks by SQLSTATE / PostgREST code when the message isn't a key. */
const CODE_MESSAGES: Record<string, string> = {
  "23514": "Bitte prüfen Sie Ihre Eingaben (Format oder Wertebereich ungültig).",
  "23505": "Dieser Eintrag existiert bereits.",
  "23P01": "Der Zeitraum überschneidet sich mit einem bestehenden Eintrag.",
  "23503": "Der Eintrag wird noch verwendet oder verweist auf etwas, das nicht mehr existiert.",
  "23502": "Bitte füllen Sie alle Pflichtfelder aus.",
  "42501": "Dafür fehlt Ihnen die Berechtigung.",
  "22P02": "Ungültiges Format. Bitte prüfen Sie Ihre Eingaben.",
  "22007": "Ungültiges Datum. Bitte prüfen Sie Ihre Eingaben.",
  "22008": "Ungültiges Datum. Bitte prüfen Sie Ihre Eingaben.",
  "22003": "Der Wert ist zu groß oder zu klein.",
  "22001": "Der Text ist zu lang.",
  "40001": "Der Server war kurz ausgelastet. Bitte versuchen Sie es erneut.",
  "40P01": "Der Server war kurz ausgelastet. Bitte versuchen Sie es erneut.",
  "57014": "Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es erneut.",
  PGRST301: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  PGRST303: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  PGRST116: "Der Eintrag wurde nicht gefunden.",
};

export const GENERIC_ERROR =
  "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut. Besteht das Problem weiter, wenden Sie sich an die Verwaltung.";

export const NETWORK_ERROR =
  "Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.";

export const SESSION_EXPIRED = MESSAGES.unauthorized;

const STORAGE_TOO_LARGE =
  "Die Datei ist zu groß. PDFs dürfen höchstens 500 KB groß sein – bitte komprimieren oder eine kleinere Datei wählen.";
const STORAGE_BAD_TYPE =
  "Dieses Dateiformat wird nicht unterstützt. Bitte laden Sie eine PDF-Datei (bzw. ein JPG/PNG-Foto für Belege) hoch.";
const STORAGE_DUPLICATE = "Eine Datei mit diesem Namen existiert bereits.";

/**
 * An error whose message is already written for users (German, no
 * internals). Everything else is mapped before it is shown.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

type ErrorLike =
  | { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown }
  | null
  | undefined;

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** fetch() failures differ per browser; all mean "no connection". */
export function isNetworkError(error: unknown): boolean {
  const e = error as ErrorLike;
  const msg = str(e?.message).toLowerCase();
  const name = str(e?.name);
  return (
    name === "FunctionsFetchError" ||
    name === "AuthRetryableFetchError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg === "load failed" ||
    msg === "fetch failed" ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

/** Supabase Storage rejections (size, type, duplicate) in plain German. */
function storageMessage(e: ErrorLike): string | undefined {
  const status = str(e?.statusCode) || str(e?.status);
  const msg = str(e?.message).toLowerCase();
  if (status === "413" || msg.includes("exceeded the maximum allowed size") || msg.includes("payload too large"))
    return STORAGE_TOO_LARGE;
  if (status === "415" || msg.includes("mime type") || msg.includes("invalid_mime_type"))
    return STORAGE_BAD_TYPE;
  if (msg.includes("resource already exists") || msg.includes("the resource already exists"))
    return STORAGE_DUPLICATE;
  return undefined;
}

// Our own German output, so an already-mapped message passes through even
// if something re-wrapped it in a plain Error.
const KNOWN_TEXTS = new Set<string>([
  ...Object.values(MESSAGES),
  ...Object.values(CODE_MESSAGES),
  GENERIC_ERROR,
  NETWORK_ERROR,
  STORAGE_TOO_LARGE,
  STORAGE_BAD_TYPE,
  STORAGE_DUPLICATE,
]);

export function dbErrorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  const e = error as ErrorLike;
  const key = str(e?.message);
  if (Object.hasOwn(MESSAGES, key)) return MESSAGES[key];
  if (KNOWN_TEXTS.has(key)) return key;
  if (isNetworkError(error)) return NETWORK_ERROR;
  const storage = storageMessage(e);
  if (storage) return storage;
  const code = str(e?.code);
  if (Object.hasOwn(CODE_MESSAGES, code)) return CODE_MESSAGES[code];
  if (key.toLowerCase().includes("jwt expired")) return SESSION_EXPIRED;
  // RLS refusals come without a key but with this wording.
  if (key.includes("row-level security")) return CODE_MESSAGES["42501"];
  return GENERIC_ERROR;
}

/** Throws an Error whose message is already user-facing German text. */
export function throwDbError(error: unknown): never {
  throw new UserFacingError(dbErrorMessage(error));
}

/**
 * Text for any caught error in a toast or inline message. Never empty and
 * never raw server text: user-facing errors pass through, the rest is mapped.
 */
export function errorText(error: unknown, fallback = GENERIC_ERROR): string {
  const text = dbErrorMessage(error);
  return text === GENERIC_ERROR ? fallback : text;
}
