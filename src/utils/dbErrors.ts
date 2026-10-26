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
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  "23514": "Bitte prüfen Sie Ihre Eingaben (Format oder Wertebereich ungültig).",
  "23505": "Dieser Eintrag existiert bereits.",
};

export const GENERIC_ERROR = "Aktion fehlgeschlagen. Bitte erneut versuchen.";

type ErrorLike = { message?: unknown; code?: unknown } | null | undefined;

export function dbErrorMessage(error: unknown): string {
  const e = error as ErrorLike;
  const key = typeof e?.message === "string" ? e.message : "";
  if (MESSAGES[key]) return MESSAGES[key];
  const code = typeof e?.code === "string" ? e.code : "";
  return CONSTRAINT_MESSAGES[code] ?? GENERIC_ERROR;
}

/** Throws an Error whose message is already user-facing German text. */
export function throwDbError(error: unknown): never {
  throw new Error(dbErrorMessage(error));
}
