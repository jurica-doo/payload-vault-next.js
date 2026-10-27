import { isNetworkError, NETWORK_ERROR } from "./dbErrors";

/**
 * German messages for Supabase Auth errors. Matches on the stable
 * `AuthError.code` (supabase-js v2), with message fallbacks for older
 * GoTrue versions. Login never says whether an account exists.
 */
export type AuthContext = "login" | "reset" | "update" | "signup" | "mfa" | "mfa_code";

const RATE_LIMIT =
  "Zu viele Versuche in kurzer Zeit. Bitte warten Sie einige Minuten und versuchen Sie es dann erneut.";

const CODES: Record<string, string> = {
  invalid_credentials: "E-Mail-Adresse oder Passwort ist falsch.",
  email_not_confirmed:
    "Ihre E-Mail-Adresse ist noch nicht bestätigt. Bitte öffnen Sie zuerst den Link aus Ihrer Einladungs-E-Mail.",
  user_banned: "Ihr Zugang ist gesperrt. Bitte wenden Sie sich an die Verwaltung.",
  over_request_rate_limit: RATE_LIMIT,
  over_email_send_rate_limit:
    "Es wurden gerade zu viele E-Mails angefordert. Bitte warten Sie einige Minuten, bevor Sie es erneut versuchen.",
  weak_password:
    "Das Passwort ist zu schwach. Bitte mindestens 8 Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen verwenden.",
  same_password: "Das neue Passwort muss sich von Ihrem aktuellen Passwort unterscheiden.",
  otp_expired: "Der Link ist abgelaufen oder wurde bereits verwendet. Bitte fordern Sie einen neuen Link an.",
  flow_state_expired: "Der Link ist abgelaufen. Bitte fordern Sie einen neuen Link an.",
  flow_state_not_found: "Der Link ist ungültig. Bitte fordern Sie einen neuen Link an.",
  session_not_found: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  session_expired: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  reauthentication_needed: "Bitte melden Sie sich erneut an, um diese Änderung zu bestätigen.",
  user_already_exists: "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melden Sie sich an.",
  email_exists: "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melden Sie sich an.",
  email_address_invalid: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
  signup_disabled: "Konten werden nur per Einladung angelegt. Bitte wenden Sie sich an die Verwaltung.",
  mfa_verification_failed: "Der Code ist falsch oder abgelaufen. Bitte geben Sie den aktuellen Code aus Ihrer App ein.",
  mfa_challenge_expired: "Die Bestätigung ist abgelaufen. Bitte geben Sie den aktuellen Code erneut ein.",
  mfa_factor_not_found: "Die Zwei-Faktor-Anmeldung wurde nicht gefunden. Bitte richten Sie sie neu ein.",
  mfa_verification_rejected: "Der Code wurde abgelehnt. Bitte versuchen Sie es erneut.",
  too_many_enrolled_mfa_factors: "Es ist bereits eine Authenticator-App eingerichtet.",
};

const DEFAULTS: Record<AuthContext, string> = {
  login: "Die Anmeldung hat nicht geklappt. Bitte versuchen Sie es erneut.",
  reset: "Der Link konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
  update: "Das Passwort konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  signup: "Die Registrierung hat nicht geklappt. Bitte versuchen Sie es erneut.",
  mfa: "Die Zwei-Faktor-Anmeldung hat nicht geklappt. Bitte versuchen Sie es erneut.",
  mfa_code: "Der Code ist falsch oder abgelaufen. Bitte geben Sie den aktuellen Code aus Ihrer App ein.",
};

type AuthErrorLike = { code?: unknown; message?: unknown; status?: unknown } | null | undefined;

export function authErrorMessage(error: unknown, context: AuthContext): string {
  const e = error as AuthErrorLike;
  if (isNetworkError(error)) return NETWORK_ERROR;
  const code = typeof e?.code === "string" ? e.code : "";
  if (Object.hasOwn(CODES, code)) return CODES[code];
  const msg = typeof e?.message === "string" ? e.message.toLowerCase() : "";
  if (e?.status === 429 || msg.includes("rate limit")) return RATE_LIMIT;
  if (msg.includes("invalid login credentials")) return CODES.invalid_credentials;
  if (msg.includes("email not confirmed")) return CODES.email_not_confirmed;
  if (msg.includes("already registered")) return CODES.user_already_exists;
  if (msg.includes("different from the old password") || msg.includes("same password")) return CODES.same_password;
  if (msg.includes("password should") || msg.includes("weak")) return CODES.weak_password;
  const isMfa = context === "mfa" || context === "mfa_code";
  if (msg.includes("expired")) return isMfa ? CODES.mfa_challenge_expired : CODES.otp_expired;
  if (isMfa && (msg.includes("invalid") || msg.includes("code"))) return CODES.mfa_verification_failed;
  // The signup trigger raises a German sentence; GoTrue wraps it.
  if (msg.includes("database error saving new user") || msg.includes("freigegebene e-mail"))
    return "Registrierung ist derzeit nur für freigegebene E-Mail-Adressen möglich.";
  return DEFAULTS[context];
}
