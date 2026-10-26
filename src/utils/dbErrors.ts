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
