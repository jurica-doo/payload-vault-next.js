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
